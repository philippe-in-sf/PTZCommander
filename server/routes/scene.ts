import type { RouteContext } from "./types";
import { insertSceneButtonSchema } from "@shared/schema";
import { logger } from "../logger";
import { fromError } from "zod-validation-error";
import { getHueClient } from "../hue";

export function registerSceneRoutes(ctx: RouteContext) {
  const { app, storage, cameraManager, x32Manager, atemManager, broadcast, pushUndo, addSessionLog } = ctx;

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
      const button = await storage.updateSceneButton(id, req.body);
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

  app.post("/api/scene-buttons/:id/execute", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const button = await storage.getSceneButton(id);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }

      const results: string[] = [];

      if (button.atemInputId !== null && button.atemInputId !== undefined) {
        const atemClient = atemManager.getClient();
        if (atemClient && atemClient.isConnected()) {
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

      if (button.mixerActions) {
        const mixerClient = x32Manager.getClient();
        if (mixerClient && mixerClient.isConnected()) {
          try {
            const actions = JSON.parse(button.mixerActions);
            for (const action of actions) {
              if (action.section && action.channel !== undefined) {
                if (action.fader !== undefined) {
                  mixerClient.setSectionFader(action.section, action.channel, action.fader);
                }
                if (action.muted !== undefined) {
                  mixerClient.setSectionMute(action.section, action.channel, action.muted);
                }
              }
            }
            results.push(`Mixer: applied ${actions.length} channel action(s)`);
          } catch {
            results.push("Mixer: invalid actions data");
          }
        } else {
          results.push("Mixer: not connected, skipped");
        }
      }

      if (button.hueActions) {
        try {
          const hueActions = JSON.parse(button.hueActions);
          for (const action of hueActions) {
            const hueClient = getHueClient(action.bridgeId);
            if (!hueClient) { results.push(`Hue: bridge ${action.bridgeId} not connected`); continue; }
            if (action.type === "scene") {
              await hueClient.activateScene(action.sceneId, action.groupId);
              results.push(`Hue: activated scene ${action.sceneId}`);
            } else if (action.type === "group") {
              const state: any = {};
              if (action.on !== undefined) state.on = action.on;
              if (action.brightness !== undefined) state.bri = action.brightness;
              if (action.colorTemp !== undefined) state.ct = action.colorTemp;
              await hueClient.setGroupState(action.groupId, state);
              results.push(`Hue: updated group ${action.groupId}`);
            } else if (action.type === "light") {
              const state: any = {};
              if (action.on !== undefined) state.on = action.on;
              if (action.brightness !== undefined) state.bri = action.brightness;
              if (action.colorTemp !== undefined) state.ct = action.colorTemp;
              await hueClient.setLightState(action.lightId, state);
              results.push(`Hue: updated light ${action.lightId}`);
            }
          }
        } catch { results.push("Hue: invalid actions data"); }
      }

      if (button.cameraId !== null && button.cameraId !== undefined && button.presetNumber !== null && button.presetNumber !== undefined) {
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

      logger.info("system", `Scene button executed: ${button.name}`, { action: "scene_button:execute", details: { buttonId: id, results } });
      addSessionLog("scene", "Scene Execute", `Scene "${button.name}" executed`);
      pushUndo({
        type: "scene_execute",
        description: `Execute scene "${button.name}"`,
        timestamp: Date.now(),
        undo: async () => {},
      });
      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to execute scene button" });
    }
  });
}
