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
let broadcastFn: ((msg: any) => void) | null = null;

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

  function broadcast(message: any) {
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
          console.log(`[Tally] Camera ${camera.name} (ID:${camera.id}): ${previousState} → ${tallyState}`);

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
      console.error("[Tally] Error updating tally lights:", error);
    }
  }

  atemManager.setStateChangeCallback((state) => {
    broadcast({ type: "atem_state", ...state });
    updateTallyLights(state.programInput, state.previewInput);
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WebSocket] Client connected");

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
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case "pan_tilt": {
            const { cameraId, pan, tilt, speed } = message;
            console.log(`[WebSocket] pan_tilt received: camera=${cameraId}, pan=${pan.toFixed(2)}, tilt=${tilt.toFixed(2)}`);
            console.log(`[WebSocket] Available camera IDs in manager: ${cameraManager.getConnectedCameraIds().join(', ') || 'none'}`);
            const client = cameraManager.getClient(cameraId);
            console.log(`[WebSocket] Got client for camera ${cameraId}: ${client ? 'YES' : 'NO'}`);
            if (!client) {
              console.log(`[WebSocket] Camera ${cameraId} has no VISCA client (not found in cameraManager)`);
            } else if (!client.isConnected()) {
              console.log(`[WebSocket] Camera ${cameraId} VISCA client exists but isConnected=${client.isConnected()}`);
            } else {
              console.log(`[WebSocket] Calling panTilt on camera ${cameraId}`);
              client.panTilt(pan, tilt, speed || 0.5);
            }
            break;
          }

          case "pan_tilt_stop": {
            const stopClient = cameraManager.getClient(message.cameraId);
            if (stopClient && stopClient.isConnected()) {
              stopClient.panTiltStop();
            } else {
              console.log(`[WebSocket] Camera ${message.cameraId} not connected, skipping pan_tilt_stop`);
            }
            break;
          }

          case "zoom": {
            const zoomClient = cameraManager.getClient(message.cameraId);
            if (zoomClient && zoomClient.isConnected()) {
              zoomClient.zoom(message.zoom, message.speed || 0.5);
            }
            break;
          }

          case "focus_auto": {
            const focusClient = cameraManager.getClient(message.cameraId);
            if (focusClient && focusClient.isConnected()) {
              focusClient.focusAuto();
            }
            break;
          }

          case "focus_far": {
            const focusFarClient = cameraManager.getClient(message.cameraId);
            if (focusFarClient && focusFarClient.isConnected()) {
              focusFarClient.focusFar(message.speed ?? 0.5);
            }
            break;
          }

          case "focus_near": {
            const focusNearClient = cameraManager.getClient(message.cameraId);
            if (focusNearClient && focusNearClient.isConnected()) {
              focusNearClient.focusNear(message.speed ?? 0.5);
            }
            break;
          }

          case "focus_stop": {
            const focusStopClient = cameraManager.getClient(message.cameraId);
            if (focusStopClient && focusStopClient.isConnected()) {
              focusStopClient.focusStop();
            }
            break;
          }

          case "recall_preset": {
            const recallClient = cameraManager.getClient(message.cameraId);
            if (recallClient && recallClient.isConnected()) {
              recallClient.recallPreset(message.presetNumber);
            }
            break;
          }

          case "mixer_section_fader": {
            const secFaderClient = x32Manager.getClient();
            if (secFaderClient && secFaderClient.isConnected()) {
              secFaderClient.setSectionFader(message.section, message.channel, message.value);
              logger.debug("mixer", `${message.section}/${message.channel} fader set to ${message.value.toFixed(2)}`, { action: "fader_change", details: { section: message.section, channel: message.channel, value: message.value } });
            } else {
              logger.warn("mixer", `Fader change ignored - mixer not connected`, { action: "fader_no_connection", details: { section: message.section, channel: message.channel } });
            }
            break;
          }

          case "mixer_section_mute": {
            const secMuteClient = x32Manager.getClient();
            if (secMuteClient && secMuteClient.isConnected()) {
              secMuteClient.setSectionMute(message.section, message.channel, message.muted);
              logger.info("mixer", `${message.section}/${message.channel} ${message.muted ? "muted" : "unmuted"}`, { action: "mute_toggle", details: { section: message.section, channel: message.channel, muted: message.muted } });
            } else {
              logger.warn("mixer", `Mute toggle ignored - mixer not connected`, { action: "mute_no_connection", details: { section: message.section, channel: message.channel } });
            }
            break;
          }

          case "mixer_fader": {
            const mixerClient = x32Manager.getClient();
            if (mixerClient && mixerClient.isConnected()) {
              mixerClient.setChannelFader(message.channel, message.value);
              logger.debug("mixer", `Channel ${message.channel} fader set to ${message.value.toFixed(2)}`, { action: "fader_change", details: { channel: message.channel, value: message.value } });
            }
            break;
          }

          case "mixer_mute": {
            const muteClient = x32Manager.getClient();
            if (muteClient && muteClient.isConnected()) {
              muteClient.setChannelMute(message.channel, message.muted);
              logger.info("mixer", `Channel ${message.channel} ${message.muted ? "muted" : "unmuted"}`, { action: "mute_toggle", details: { channel: message.channel, muted: message.muted } });
            }
            break;
          }

          case "mixer_main_fader": {
            const mainClient = x32Manager.getClient();
            if (mainClient && mainClient.isConnected()) {
              mainClient.setMainFader(message.value);
              logger.debug("mixer", `Main fader set to ${message.value.toFixed(2)}`, { action: "main_fader_change", details: { value: message.value } });
            }
            break;
          }

          case "mixer_main_mute": {
            const mainMuteClient = x32Manager.getClient();
            if (mainMuteClient && mainMuteClient.isConnected()) {
              mainMuteClient.setMainMute(message.muted);
              logger.info("mixer", `Main output ${message.muted ? "muted" : "unmuted"}`, { action: "main_mute_toggle", details: { muted: message.muted } });
            }
            break;
          }

          case "mixer_query_section": {
            const queryClient2 = x32Manager.getClient();
            if (queryClient2 && queryClient2.isConnected()) {
              queryClient2.querySectionState(message.section);
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
              atemPgmClient.setProgramInput(message.inputId);
              addSessionLog("switcher", "ATEM Program", `Program input set to ${message.inputId}`);
            }
            break;
          }

          case "atem_preview": {
            const atemPvwClient = atemManager.getClient();
            if (atemPvwClient && atemPvwClient.isConnected()) {
              atemPvwClient.setPreviewInput(message.inputId);
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
              atemStyleClient.setTransitionStyle(message.style);
            }
            break;
          }

          case "atem_transition_preview": {
            const atemPrevClient = atemManager.getClient();
            if (atemPrevClient && atemPrevClient.isConnected()) {
              atemPrevClient.setTransitionPreview(message.enabled);
            }
            break;
          }

          case "atem_transition_position": {
            const atemPosClient = atemManager.getClient();
            if (atemPosClient && atemPosClient.isConnected()) {
              atemPosClient.setTransitionPosition(message.position);
            }
            break;
          }

          case "atem_mix_rate": {
            const atemMixRateClient = atemManager.getClient();
            if (atemMixRateClient && atemMixRateClient.isConnected()) {
              atemMixRateClient.setMixRate(message.rate);
            }
            break;
          }

          case "atem_ftb_rate": {
            const atemFtbRateClient = atemManager.getClient();
            if (atemFtbRateClient && atemFtbRateClient.isConnected()) {
              atemFtbRateClient.setFadeToBlackRate(message.rate);
            }
            break;
          }

          case "atem_dsk_on_air": {
            const atemDskAirClient = atemManager.getClient();
            if (atemDskAirClient && atemDskAirClient.isConnected()) {
              atemDskAirClient.setDSKOnAir(message.index, message.onAir);
            }
            break;
          }

          case "atem_dsk_tie": {
            const atemDskTieClient = atemManager.getClient();
            if (atemDskTieClient && atemDskTieClient.isConnected()) {
              atemDskTieClient.setDSKTie(message.index, message.tie);
            }
            break;
          }

          case "atem_dsk_auto": {
            const atemDskAutoClient = atemManager.getClient();
            if (atemDskAutoClient && atemDskAutoClient.isConnected()) {
              atemDskAutoClient.autoDSK(message.index);
            }
            break;
          }

          case "atem_dsk_rate": {
            const atemDskRateClient = atemManager.getClient();
            if (atemDskRateClient && atemDskRateClient.isConnected()) {
              atemDskRateClient.setDSKRate(message.index, message.rate);
            }
            break;
          }

          case "atem_usk_on_air": {
            const atemUskClient = atemManager.getClient();
            if (atemUskClient && atemUskClient.isConnected()) {
              atemUskClient.setUSKOnAir(message.index, message.onAir);
            }
            break;
          }

          case "atem_macro_run": {
            const atemMacroRunClient = atemManager.getClient();
            if (atemMacroRunClient && atemMacroRunClient.isConnected()) {
              atemMacroRunClient.runMacro(message.index);
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
              atemAuxClient.setAuxSource(message.auxIndex, message.sourceId);
            }
            break;
          }
        }
      } catch (error) {
        console.error("[WebSocket] Error processing message:", error);
      }
    });

    ws.on("close", () => {
      console.log("[WebSocket] Client disconnected");
    });
  });

  setTimeout(async () => {
    try {
      const cameras = await storage.getAllCameras();
      for (const camera of cameras) {
        const connected = await cameraManager.connectCamera(camera.id, camera.ip, camera.port);
        await storage.updateCameraStatus(camera.id, connected ? "online" : "offline");
      }
      console.log(`[VISCA] Initialized ${cameras.length} camera connection(s)`);
    } catch (error) {
      console.error("[VISCA] Error initializing camera connections:", error);
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
    } catch (error) {
      console.error("[Hue] Error initializing bridges:", error);
    }
  }, 1000);

  return httpServer;
}
