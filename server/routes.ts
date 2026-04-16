import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { cameraManager } from "./visca";
import { x32Manager } from "./x32";
import { atemManager } from "./atem";
import { logger, setupAuditLogging } from "./logger";
import { setHueClient, getHueClient } from "./hue";
import { APP_VERSION } from "@shared/version";
import http from "http";
import https from "https";
import type { UndoAction, SessionLogEntry, RouteContext } from "./routes/types";
import {
  registerCameraRoutes,
  registerMixerRoutes,
  registerSwitcherRoutes,
  registerSceneRoutes,
  registerLayoutRoutes,
  registerMacroRoutes,
  registerLightingRoutes,
  registerDisplayRoutes,
  registerSystemRoutes,
} from "./routes/index";

const undoStack: UndoAction[] = [];
const MAX_UNDO = 50;

function pushUndo(action: UndoAction) {
  undoStack.push(action);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

let sessionLogId = 0;
const sessionLog: SessionLogEntry[] = [];
const MAX_SESSION_LOG = 500;
let broadcastFn: ((msg: Record<string, unknown>) => void) | null = null;

async function captureSnapshot(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const mod = url.startsWith("https") ? https : http;
      const req = mod.get(url, { timeout: 3000 }, (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          const base64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;
          resolve(base64);
        });
        res.on("error", () => resolve(null));
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => { req.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

function addSessionLog(category: SessionLogEntry["category"], action: string, details: string) {
  const entry: SessionLogEntry = {
    id: ++sessionLogId,
    timestamp: Date.now(),
    action,
    details,
    category,
  };
  sessionLog.push(entry);
  if (sessionLog.length > MAX_SESSION_LOG) sessionLog.shift();
  if (broadcastFn) {
    broadcastFn({ type: "session_log", entry });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  setupAuditLogging();
  logger.info("system", `Application started — PTZ Command v${APP_VERSION}`);

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  function broadcast(message: Record<string, unknown>) {
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  broadcastFn = broadcast;

  const ctx: RouteContext = {
    app,
    storage,
    cameraManager,
    x32Manager,
    atemManager,
    broadcast,
    pushUndo,
    addSessionLog,
    captureSnapshot,
    undoStack,
    sessionLog,
  };

  registerSystemRoutes(ctx);
  registerCameraRoutes(ctx);
  registerMixerRoutes(ctx);
  registerSwitcherRoutes(ctx);
  registerSceneRoutes(ctx);
  registerLayoutRoutes(ctx);
  registerMacroRoutes(ctx);
  registerLightingRoutes(ctx);
  registerDisplayRoutes(ctx);

  x32Manager.setStateChangeCallback((section, states) => {
    broadcast({ type: "mixer_state", section, channels: states });
  });

  let previousTallyMap: Map<number, string> = new Map();

  async function updateTallyLights(programInput: number, previewInput: number) {
    try {
      const cameras = await storage.getAllCameras();
      const newTallyMap = new Map<number, string>();

      for (const camera of cameras) {
        if (!camera.atemInputId) continue;

        let tallyState = "off";
        if (camera.atemInputId === programInput) {
          tallyState = "program";
        } else if (camera.atemInputId === previewInput) {
          tallyState = "preview";
        }

        newTallyMap.set(camera.id, tallyState);
        const previousState = previousTallyMap.get(camera.id) || "off";

        if (tallyState !== previousState) {
          logger.info("camera", `Tally: ${camera.name} (ID:${camera.id}): ${previousState} → ${tallyState}`, { action: "tally_change", details: { cameraId: camera.id, from: previousState, to: tallyState } });

          await storage.updateCamera(camera.id, { tallyState });

          const client = cameraManager.getClient(camera.id);
          if (client && client.isConnected()) {
            if (tallyState === "program" || tallyState === "preview") {
              client.tallyOn();
            } else {
              client.tallyOff();
            }
          }
        }
      }

      previousTallyMap = newTallyMap;
    } catch (error) {
      logger.error("camera", `Error updating tally lights: ${error instanceof Error ? error.message : String(error)}`, { action: "tally_error" });
    }
  }

  atemManager.setStateChangeCallback((state) => {
    broadcast({ type: "atem_state", ...state });
    updateTallyLights(state.programInput, state.previewInput);
  });

  wss.on("connection", (ws: WebSocket) => {
    logger.info("websocket", "Client connected", { action: "ws_connect" });

    ws.send(JSON.stringify({ type: "version", version: APP_VERSION }));

    const mixerClient = x32Manager.getClient();
    if (mixerClient && mixerClient.isConnected()) {
      ws.send(JSON.stringify({
        type: "mixer_state",
        channels: mixerClient.getChannelStates()
      }));
    }

    const atemState = atemManager.getState();
    if (atemState && atemState.connected) {
      ws.send(JSON.stringify({
        type: "atem_state",
        ...atemState
      }));
    }

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as { type: string; [key: string]: unknown };

        switch (message.type) {
          case "pan_tilt": {
            const { cameraId, pan, tilt, speed } = message as { cameraId: number; pan: number; tilt: number; speed?: number; type: string };
            logger.debug("websocket", `pan_tilt received: camera=${cameraId}, pan=${(pan as number).toFixed(2)}, tilt=${(tilt as number).toFixed(2)}`, { action: "ws_pan_tilt" });
            const client = cameraManager.getClient(cameraId);
            if (client && client.isConnected()) {
              client.panTilt(pan, tilt, speed || 0.5);
            } else {
              logger.debug("websocket", `Camera ${cameraId} not connected for pan_tilt`, { action: "ws_pan_tilt_skip" });
            }
            break;
          }

          case "pan_tilt_stop": {
            const stopClient = cameraManager.getClient(message.cameraId as number);
            if (stopClient && stopClient.isConnected()) {
              stopClient.panTiltStop();
            }
            break;
          }

          case "zoom": {
            const zoomClient = cameraManager.getClient(message.cameraId as number);
            if (zoomClient && zoomClient.isConnected()) {
              zoomClient.zoom(message.zoom as number, (message.speed as number) || 0.5);
            }
            break;
          }

          case "focus_auto": {
            const focusClient = cameraManager.getClient(message.cameraId as number);
            if (focusClient && focusClient.isConnected()) {
              focusClient.focusAuto();
            }
            break;
          }

          case "focus_far": {
            const focusFarClient = cameraManager.getClient(message.cameraId as number);
            if (focusFarClient && focusFarClient.isConnected()) {
              focusFarClient.focusFar((message.speed as number) ?? 0.5);
            }
            break;
          }

          case "focus_near": {
            const focusNearClient = cameraManager.getClient(message.cameraId as number);
            if (focusNearClient && focusNearClient.isConnected()) {
              focusNearClient.focusNear((message.speed as number) ?? 0.5);
            }
            break;
          }

          case "focus_stop": {
            const focusStopClient = cameraManager.getClient(message.cameraId as number);
            if (focusStopClient && focusStopClient.isConnected()) {
              focusStopClient.focusStop();
            }
            break;
          }

          case "recall_preset": {
            const recallClient = cameraManager.getClient(message.cameraId as number);
            if (recallClient && recallClient.isConnected()) {
              recallClient.recallPreset(message.presetNumber as number);
            }
            break;
          }

          case "mixer_section_fader": {
            const secFaderClient = x32Manager.getClient();
            const section = message.section as string;
            const channel = message.channel as number;
            const value = message.value as number;
            if (secFaderClient && secFaderClient.isConnected()) {
              secFaderClient.setSectionFader(section as import("./x32").MixerSection, channel, value);
              logger.debug("mixer", `${section}/${channel} fader set to ${value.toFixed(2)}`, { action: "fader_change", details: { section, channel, value } });
            } else {
              logger.warn("mixer", `Fader change ignored - mixer not connected`, { action: "fader_no_connection", details: { section, channel } });
            }
            break;
          }

          case "mixer_section_mute": {
            const secMuteClient = x32Manager.getClient();
            const section = message.section as string;
            const channel = message.channel as number;
            const muted = message.muted as boolean;
            if (secMuteClient && secMuteClient.isConnected()) {
              secMuteClient.setSectionMute(section as import("./x32").MixerSection, channel, muted);
              logger.info("mixer", `${section}/${channel} ${muted ? "muted" : "unmuted"}`, { action: "mute_toggle", details: { section, channel, muted } });
            } else {
              logger.warn("mixer", `Mute toggle ignored - mixer not connected`, { action: "mute_no_connection", details: { section, channel } });
            }
            break;
          }

          case "mixer_fader": {
            const mixerClient = x32Manager.getClient();
            const channel = message.channel as number;
            const value = message.value as number;
            if (mixerClient && mixerClient.isConnected()) {
              mixerClient.setChannelFader(channel, value);
              logger.debug("mixer", `Channel ${channel} fader set to ${value.toFixed(2)}`, { action: "fader_change", details: { channel, value } });
            }
            break;
          }

          case "mixer_mute": {
            const muteClient = x32Manager.getClient();
            const channel = message.channel as number;
            const muted = message.muted as boolean;
            if (muteClient && muteClient.isConnected()) {
              muteClient.setChannelMute(channel, muted);
              logger.info("mixer", `Channel ${channel} ${muted ? "muted" : "unmuted"}`, { action: "mute_toggle", details: { channel, muted } });
            }
            break;
          }

          case "mixer_main_fader": {
            const mainClient = x32Manager.getClient();
            const value = message.value as number;
            if (mainClient && mainClient.isConnected()) {
              mainClient.setMainFader(value);
              logger.debug("mixer", `Main fader set to ${value.toFixed(2)}`, { action: "main_fader_change", details: { value } });
            }
            break;
          }

          case "mixer_main_mute": {
            const mainMuteClient = x32Manager.getClient();
            const muted = message.muted as boolean;
            if (mainMuteClient && mainMuteClient.isConnected()) {
              mainMuteClient.setMainMute(muted);
              logger.info("mixer", `Main output ${muted ? "muted" : "unmuted"}`, { action: "main_mute_toggle", details: { muted } });
            }
            break;
          }

          case "mixer_query_section": {
            const queryClient2 = x32Manager.getClient();
            if (queryClient2 && queryClient2.isConnected()) {
              queryClient2.querySectionState(message.section as import("./x32").MixerSection);
            }
            break;
          }

          case "atem_cut": {
            const atemCutClient = atemManager.getClient();
            if (atemCutClient && atemCutClient.isConnected()) {
              atemCutClient.cut();
              addSessionLog("switcher", "ATEM Cut", "Cut transition executed");
            }
            break;
          }

          case "atem_auto": {
            const atemAutoClient = atemManager.getClient();
            if (atemAutoClient && atemAutoClient.isConnected()) {
              atemAutoClient.autoTransition();
              addSessionLog("switcher", "ATEM Auto", "Auto transition executed");
            }
            break;
          }

          case "atem_program": {
            const atemPgmClient = atemManager.getClient();
            if (atemPgmClient && atemPgmClient.isConnected()) {
              atemPgmClient.setProgramInput(message.inputId as number);
              addSessionLog("switcher", "ATEM Program", `Program input set to ${message.inputId}`);
            }
            break;
          }

          case "atem_preview": {
            const atemPvwClient = atemManager.getClient();
            if (atemPvwClient && atemPvwClient.isConnected()) {
              atemPvwClient.setPreviewInput(message.inputId as number);
              addSessionLog("switcher", "ATEM Preview", `Preview input set to ${message.inputId}`);
            }
            break;
          }

          case "atem_ftb": {
            const atemFtbClient = atemManager.getClient();
            if (atemFtbClient && atemFtbClient.isConnected()) {
              atemFtbClient.fadeToBlack();
            }
            break;
          }

          case "atem_transition_style": {
            const atemStyleClient = atemManager.getClient();
            if (atemStyleClient && atemStyleClient.isConnected()) {
              atemStyleClient.setTransitionStyle(message.style as number);
            }
            break;
          }

          case "atem_transition_preview": {
            const atemPrevClient = atemManager.getClient();
            if (atemPrevClient && atemPrevClient.isConnected()) {
              atemPrevClient.setTransitionPreview(message.enabled as boolean);
            }
            break;
          }

          case "atem_transition_position": {
            const atemPosClient = atemManager.getClient();
            if (atemPosClient && atemPosClient.isConnected()) {
              atemPosClient.setTransitionPosition(message.position as number);
            }
            break;
          }

          case "atem_mix_rate": {
            const atemMixRateClient = atemManager.getClient();
            if (atemMixRateClient && atemMixRateClient.isConnected()) {
              atemMixRateClient.setMixRate(message.rate as number);
            }
            break;
          }

          case "atem_ftb_rate": {
            const atemFtbRateClient = atemManager.getClient();
            if (atemFtbRateClient && atemFtbRateClient.isConnected()) {
              atemFtbRateClient.setFadeToBlackRate(message.rate as number);
            }
            break;
          }

          case "atem_dsk_on_air": {
            const atemDskAirClient = atemManager.getClient();
            if (atemDskAirClient && atemDskAirClient.isConnected()) {
              atemDskAirClient.setDSKOnAir(message.index as number, message.onAir as boolean);
            }
            break;
          }

          case "atem_dsk_tie": {
            const atemDskTieClient = atemManager.getClient();
            if (atemDskTieClient && atemDskTieClient.isConnected()) {
              atemDskTieClient.setDSKTie(message.index as number, message.tie as boolean);
            }
            break;
          }

          case "atem_dsk_auto": {
            const atemDskAutoClient = atemManager.getClient();
            if (atemDskAutoClient && atemDskAutoClient.isConnected()) {
              atemDskAutoClient.autoDSK(message.index as number);
            }
            break;
          }

          case "atem_dsk_rate": {
            const atemDskRateClient = atemManager.getClient();
            if (atemDskRateClient && atemDskRateClient.isConnected()) {
              atemDskRateClient.setDSKRate(message.index as number, message.rate as number);
            }
            break;
          }

          case "atem_usk_on_air": {
            const atemUskClient = atemManager.getClient();
            if (atemUskClient && atemUskClient.isConnected()) {
              atemUskClient.setUSKOnAir(message.index as number, message.onAir as boolean);
            }
            break;
          }

          case "atem_macro_run": {
            const atemMacroRunClient = atemManager.getClient();
            if (atemMacroRunClient && atemMacroRunClient.isConnected()) {
              atemMacroRunClient.runMacro(message.index as number);
            }
            break;
          }

          case "atem_macro_stop": {
            const atemMacroStopClient = atemManager.getClient();
            if (atemMacroStopClient && atemMacroStopClient.isConnected()) {
              atemMacroStopClient.stopMacro();
            }
            break;
          }

          case "atem_macro_continue": {
            const atemMacroContinueClient = atemManager.getClient();
            if (atemMacroContinueClient && atemMacroContinueClient.isConnected()) {
              atemMacroContinueClient.continueMacro();
            }
            break;
          }

          case "atem_aux_source": {
            const atemAuxClient = atemManager.getClient();
            if (atemAuxClient && atemAuxClient.isConnected()) {
              atemAuxClient.setAuxSource(message.auxIndex as number, message.sourceId as number);
            }
            break;
          }
        }
      } catch (error: unknown) {
        logger.error("websocket", `Error processing message: ${error instanceof Error ? error.message : String(error)}`, { action: "ws_message_error" });
      }
    });

    ws.on("close", () => {
      logger.info("websocket", "Client disconnected", { action: "ws_disconnect" });
    });
  });

  setTimeout(async () => {
    try {
      const cameras = await storage.getAllCameras();
      for (const camera of cameras) {
        const connected = await cameraManager.connectCamera(camera.id, camera.ip, camera.port);
        await storage.updateCameraStatus(camera.id, connected ? "online" : "offline");
      }
      logger.info("camera", `Initialized ${cameras.length} camera connection(s)`, { action: "visca_init" });
    } catch (error: unknown) {
      logger.error("camera", `Error initializing camera connections: ${error instanceof Error ? error.message : String(error)}`, { action: "visca_init_error" });
    }
    try {
      const bridges = await storage.getAllHueBridges();
      for (const bridge of bridges) {
        if (bridge.apiKey) {
          setHueClient(bridge.id, bridge.ip, bridge.apiKey);
          const online = await getHueClient(bridge.id)?.ping();
          await storage.updateHueBridge(bridge.id, { status: online ? "online" : "offline" });
        }
      }
    } catch (error: unknown) {
      logger.error("system", `Error initializing Hue bridges: ${error instanceof Error ? error.message : String(error)}`, { action: "hue_init_error" });
    }
  }, 1000);

  return httpServer;
}
