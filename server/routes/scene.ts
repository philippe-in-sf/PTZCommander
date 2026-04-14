import type { RouteContext } from "./types";
import { insertSceneButtonSchema, patchSceneButtonSchema, type SceneButton } from "@shared/schema";
import { logger } from "../logger";
import { fromError } from "zod-validation-error";
import { getHueClient } from "../hue";
import type { ChannelState, MixerSection } from "../x32";

type SceneSection = "atem" | "mixer" | "hue" | "ptz";

interface MixerAction {
  section: MixerSection;
  channel: number;
  fader?: number;
  muted?: boolean;
}

interface HueAction {
  type: "scene" | "group" | "light";
  bridgeId: number;
  sceneId?: string;
  groupId?: string;
  lightId?: string;
  on?: boolean;
  brightness?: number;
  colorTemp?: number;
}

function parseJsonArray<T>(value: string | null): T[] | null {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sectionEnabled(section: SceneSection, sections?: SceneSection[]) {
  return !sections || sections.includes(section);
}

function getScenePreview(button: SceneButton) {
  const preview: string[] = [];
  if (button.atemInputId !== null && button.atemInputId !== undefined) {
    preview.push(`ATEM: ${button.atemTransitionType === "auto" ? "auto transition" : "cut"} to input ${button.atemInputId}`);
  }
  if (button.cameraId !== null && button.cameraId !== undefined && button.presetNumber !== null && button.presetNumber !== undefined) {
    preview.push(`PTZ: camera ${button.cameraId} recalls preset ${button.presetNumber + 1}`);
  }
  const mixerActions = parseJsonArray<MixerAction>(button.mixerActions);
  if (mixerActions === null) preview.push("Mixer: invalid action data");
  else if (mixerActions.length > 0) preview.push(`Mixer: ${mixerActions.length} channel action(s)`);
  const hueActions = parseJsonArray<HueAction>(button.hueActions);
  if (hueActions === null) preview.push("Hue: invalid action data");
  else if (hueActions.length > 0) preview.push(`Hue: ${hueActions.length} lighting action(s)`);
  return preview.length > 0 ? preview : ["No hardware actions configured"];
}

export function registerSceneRoutes(ctx: RouteContext) {
  const { app, storage, cameraManager, x32Manager, atemManager, broadcast, pushUndo, addSessionLog } = ctx;

  async function executeSceneButton(button: SceneButton, sections?: SceneSection[]) {
    const results: string[] = [];
    const undoSteps: Array<() => Promise<void>> = [];

    if (sectionEnabled("atem", sections) && button.atemInputId !== null && button.atemInputId !== undefined) {
      const atemClient = atemManager.getClient();
      if (atemClient && atemClient.isConnected()) {
        const previous = atemClient.getState();
        undoSteps.push(async () => {
          const currentClient = atemManager.getClient();
          if (!currentClient || !currentClient.isConnected()) return;
          await currentClient.setPreviewInput(previous.previewInput);
          await currentClient.setProgramInput(previous.programInput);
        });
        if (button.atemTransitionType === "auto") {
          await atemClient.setPreviewInput(button.atemInputId);
          await atemClient.autoTransition();
        } else {
          await atemClient.setProgramInput(button.atemInputId);
        }
        results.push(`ATEM: switched to input ${button.atemInputId} (${button.atemTransitionType})`);
      } else {
        results.push("ATEM: not connected, skipped");
      }
    }

    if (sectionEnabled("mixer", sections) && button.mixerActions) {
      const mixerClient = x32Manager.getClient();
      if (mixerClient && mixerClient.isConnected()) {
        const actions = parseJsonArray<MixerAction>(button.mixerActions);
        if (actions === null) {
          results.push("Mixer: invalid actions data");
        } else {
          const snapshots = new Map<string, ChannelState>();
          for (const action of actions) {
            if (action.section && action.channel !== undefined) {
              const key = `${action.section}:${action.channel}`;
              const current = mixerClient.getSectionStates(action.section).find((state) => state.channel === action.channel);
              if (current && !snapshots.has(key)) {
                snapshots.set(key, { ...current });
              }
              if (action.fader !== undefined) {
                mixerClient.setSectionFader(action.section, action.channel, action.fader);
              }
              if (action.muted !== undefined) {
                mixerClient.setSectionMute(action.section, action.channel, action.muted);
              }
            }
          }
          if (snapshots.size > 0) {
            undoSteps.push(async () => {
              const currentClient = x32Manager.getClient();
              if (!currentClient || !currentClient.isConnected()) return;
              for (const snapshot of snapshots.values()) {
                currentClient.setSectionFader(snapshot.section, snapshot.channel, snapshot.fader);
                currentClient.setSectionMute(snapshot.section, snapshot.channel, snapshot.muted);
              }
            });
          }
          results.push(`Mixer: applied ${actions.length} channel action(s)`);
        }
      } else {
        results.push("Mixer: not connected, skipped");
      }
    }

    if (sectionEnabled("hue", sections) && button.hueActions) {
      const hueActions = parseJsonArray<HueAction>(button.hueActions);
      if (hueActions === null) {
        results.push("Hue: invalid actions data");
      } else {
        for (const action of hueActions) {
          const hueClient = getHueClient(action.bridgeId);
          if (!hueClient) {
            results.push(`Hue: bridge ${action.bridgeId} not connected`);
            continue;
          }
          if (action.type === "scene" && action.sceneId) {
            try {
              if (action.groupId) {
                const groups = await hueClient.getGroups();
                const snapshot = groups.find((group) => group.id === action.groupId);
                if (snapshot) {
                  undoSteps.push(async () => {
                    const currentClient = getHueClient(action.bridgeId);
                    if (currentClient) await currentClient.setGroupState(action.groupId!, { on: snapshot.on, bri: snapshot.brightness });
                  });
                }
              } else {
                const lights = await hueClient.getLights();
                undoSteps.push(async () => {
                  const currentClient = getHueClient(action.bridgeId);
                  if (!currentClient) return;
                  for (const light of lights) {
                    await currentClient.setLightState(light.id, {
                      on: light.on,
                      bri: light.brightness,
                      ct: light.colorTemp,
                      hue: light.hue,
                      sat: light.sat,
                    });
                  }
                });
              }
            } catch {
              results.push("Hue: rollback snapshot unavailable");
            }
            await hueClient.activateScene(action.sceneId, action.groupId);
            results.push(`Hue: activated scene ${action.sceneId}`);
          } else if (action.type === "group" && action.groupId) {
            try {
              const groups = await hueClient.getGroups();
              const snapshot = groups.find((group) => group.id === action.groupId);
              if (snapshot) {
                undoSteps.push(async () => {
                  const currentClient = getHueClient(action.bridgeId);
                  if (currentClient) await currentClient.setGroupState(action.groupId!, { on: snapshot.on, bri: snapshot.brightness });
                });
              }
            } catch {
              results.push("Hue: rollback snapshot unavailable");
            }
            const state: any = {};
            if (action.on !== undefined) state.on = action.on;
            if (action.brightness !== undefined) state.bri = action.brightness;
            if (action.colorTemp !== undefined) state.ct = action.colorTemp;
            await hueClient.setGroupState(action.groupId, state);
            results.push(`Hue: updated group ${action.groupId}`);
          } else if (action.type === "light" && action.lightId) {
            try {
              const lights = await hueClient.getLights();
              const snapshot = lights.find((light) => light.id === action.lightId);
              if (snapshot) {
                undoSteps.push(async () => {
                  const currentClient = getHueClient(action.bridgeId);
                  if (currentClient) {
                    await currentClient.setLightState(action.lightId!, {
                      on: snapshot.on,
                      bri: snapshot.brightness,
                      ct: snapshot.colorTemp,
                      hue: snapshot.hue,
                      sat: snapshot.sat,
                    });
                  }
                });
              }
            } catch {
              results.push("Hue: rollback snapshot unavailable");
            }
            const state: any = {};
            if (action.on !== undefined) state.on = action.on;
            if (action.brightness !== undefined) state.bri = action.brightness;
            if (action.colorTemp !== undefined) state.ct = action.colorTemp;
            await hueClient.setLightState(action.lightId, state);
            results.push(`Hue: updated light ${action.lightId}`);
          }
        }
      }
    }

    if (sectionEnabled("ptz", sections) && button.cameraId !== null && button.cameraId !== undefined && button.presetNumber !== null && button.presetNumber !== undefined) {
      const connectedIds = cameraManager.getConnectedCameraIds();
      const camClient = cameraManager.getClient(button.cameraId);
      logger.info("system", `Scene PTZ: cameraId=${button.cameraId}, presetNumber=${button.presetNumber}, connectedCameras=[${connectedIds.join(',')}], clientFound=${!!camClient}, connected=${camClient?.isConnected()}`);
      if (camClient && camClient.isConnected()) {
        camClient.recallPreset(button.presetNumber);
        results.push(`PTZ: camera ${button.cameraId} recalled preset ${button.presetNumber + 1}`);
      } else {
        results.push(`PTZ: camera ${button.cameraId} not connected (connected cameras: ${connectedIds.length > 0 ? connectedIds.join(',') : 'none'})`);
      }
    }

    return { results, undoSteps };
  }

  app.get("/api/scene-buttons", async (_req, res) => {
    try {
      const buttons = await storage.getAllSceneButtons();
      res.json(buttons);
    } catch (error) {
      res.status(500).json({ message: "Failed to get scene buttons" });
    }
  });

  app.post("/api/scene-buttons", async (req, res) => {
    try {
      const result = insertSceneButtonSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const button = await storage.createSceneButton(result.data);
      logger.info("system", `Scene button created: ${button.name}`, { action: "scene_button:create", details: { buttonId: button.id, name: button.name } });
      broadcast({ type: "invalidate", keys: ["scene-buttons"] });
      res.json(button);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create scene button" });
    }
  });

  app.patch("/api/scene-buttons/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = patchSceneButtonSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const button = await storage.updateSceneButton(id, result.data);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }
      broadcast({ type: "invalidate", keys: ["scene-buttons"] });
      res.json(button);
    } catch (error) {
      res.status(500).json({ message: "Failed to update scene button" });
    }
  });

  app.delete("/api/scene-buttons/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSceneButton(id);
      logger.info("system", `Scene button deleted`, { action: "scene_button:delete", details: { buttonId: id } });
      broadcast({ type: "invalidate", keys: ["scene-buttons"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete scene button" });
    }
  });

  app.get("/api/scene-buttons/:id/preview", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const button = await storage.getSceneButton(id);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }
      res.json({ preview: getScenePreview(button) });
    } catch {
      res.status(500).json({ message: "Failed to preview scene button" });
    }
  });

  app.post("/api/scene-buttons/:id/test", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const section = req.body?.section as SceneSection | undefined;
      if (!section || !["atem", "mixer", "hue", "ptz"].includes(section)) {
        return res.status(400).json({ message: "Invalid scene test section" });
      }
      const button = await storage.getSceneButton(id);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }

      const { results, undoSteps } = await executeSceneButton(button, [section]);
      if (undoSteps.length > 0) {
        pushUndo({
          type: "scene_test",
          description: `Test ${section.toUpperCase()} for scene "${button.name}"`,
          timestamp: Date.now(),
          undo: async () => {
            for (const step of [...undoSteps].reverse()) await step();
          },
        });
      }
      logger.info("system", `Scene button test: ${button.name}`, { action: "scene_button:test", details: { buttonId: id, section, results } });
      addSessionLog("scene", "Scene Test", `Tested ${section.toUpperCase()} for scene "${button.name}"`);
      broadcast({ type: "invalidate", keys: ["undo-status"] });
      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to test scene button" });
    }
  });

  app.post("/api/scene-buttons/:id/execute", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const button = await storage.getSceneButton(id);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }

      const { results, undoSteps } = await executeSceneButton(button);

      logger.info("system", `Scene button executed: ${button.name}`, { action: "scene_button:execute", details: { buttonId: id, results } });
      addSessionLog("scene", "Scene Execute", `Scene "${button.name}" executed`);
      if (undoSteps.length > 0) {
        pushUndo({
          type: "scene_execute",
          description: `Execute scene "${button.name}"`,
          timestamp: Date.now(),
          undo: async () => {
            for (const step of [...undoSteps].reverse()) await step();
          },
        });
        broadcast({ type: "invalidate", keys: ["undo-status"] });
      }
      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to execute scene button" });
    }
  });
}
