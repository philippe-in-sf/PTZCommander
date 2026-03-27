import type { RouteContext } from "./types";
import { insertMacroSchema } from "@shared/schema";
import { logger } from "../logger";
import { fromError } from "zod-validation-error";
import { getHueClient } from "../hue";

export function registerMacroRoutes(ctx: RouteContext) {
  const { app, storage, cameraManager, atemManager, broadcast, addSessionLog } = ctx;

  app.get("/api/macros", async (_req, res) => {
    try {
      const allMacros = await storage.getAllMacros();
      res.json(allMacros);
    } catch (error) {
      res.status(500).json({ message: "Failed to get macros" });
    }
  });

  app.get("/api/macros/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const macro = await storage.getMacro(id);
      if (!macro) return res.status(404).json({ message: "Macro not found" });
      res.json(macro);
    } catch (error) {
      res.status(500).json({ message: "Failed to get macro" });
    }
  });

  app.post("/api/macros", async (req, res) => {
    try {
      const parsed = insertMacroSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).message });
      }
      const macro = await storage.createMacro(parsed.data);
      logger.info("system", `Macro created: ${macro.name}`, { action: "macro:create" });
      broadcast({ type: "invalidate", keys: ["macros"] });
      res.status(201).json(macro);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create macro" });
    }
  });

  app.patch("/api/macros/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const macro = await storage.updateMacro(id, req.body);
      if (!macro) return res.status(404).json({ message: "Macro not found" });
      logger.info("system", `Macro updated: ${macro.name}`, { action: "macro:update" });
      broadcast({ type: "invalidate", keys: ["macros"] });
      res.json(macro);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update macro" });
    }
  });

  app.delete("/api/macros/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteMacro(id);
      logger.info("system", `Macro deleted`, { action: "macro:delete" });
      broadcast({ type: "invalidate", keys: ["macros"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete macro" });
    }
  });

  app.post("/api/macros/:id/execute", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const macro = await storage.getMacro(id);
      if (!macro) return res.status(404).json({ message: "Macro not found" });

      const steps = JSON.parse(macro.steps);
      logger.info("system", `Executing macro: ${macro.name} (${steps.length} steps)`, { action: "macro:execute" });

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];

        switch (step.type) {
          case "recall_preset": {
            const client = cameraManager.getClient(step.cameraId);
            if (client && client.isConnected()) {
              client.recallPreset(step.presetNumber);
            }
            break;
          }
          case "pan_tilt": {
            const client = cameraManager.getClient(step.cameraId);
            if (client && client.isConnected()) {
              client.panTilt(step.pan, step.tilt, step.speed || 0.5);
            }
            break;
          }
          case "pan_tilt_stop": {
            const client = cameraManager.getClient(step.cameraId);
            if (client && client.isConnected()) {
              client.panTiltStop();
            }
            break;
          }
          case "zoom": {
            const client = cameraManager.getClient(step.cameraId);
            if (client && client.isConnected()) {
              client.zoom(step.direction, step.speed || 0.5);
            }
            break;
          }
          case "focus_auto": {
            const client = cameraManager.getClient(step.cameraId);
            if (client && client.isConnected()) {
              client.focusAuto();
            }
            break;
          }
          case "atem_cut": {
            const atemClient = atemManager.getClient();
            if (atemClient && atemClient.isConnected()) atemClient.cut();
            break;
          }
          case "atem_auto": {
            const atemClient = atemManager.getClient();
            if (atemClient && atemClient.isConnected()) atemClient.autoTransition();
            break;
          }
          case "atem_program": {
            const atemClient = atemManager.getClient();
            if (atemClient && atemClient.isConnected()) atemClient.setProgramInput(step.inputId);
            break;
          }
          case "atem_preview": {
            const atemClient = atemManager.getClient();
            if (atemClient && atemClient.isConnected()) atemClient.setPreviewInput(step.inputId);
            break;
          }
          case "delay": {
            await new Promise(resolve => setTimeout(resolve, step.duration || 1000));
            break;
          }
          case "hue_scene": {
            const hueClient = getHueClient(step.bridgeId);
            if (hueClient) await hueClient.activateScene(step.sceneId, step.groupId);
            break;
          }
          case "hue_group": {
            const hueClient = getHueClient(step.bridgeId);
            if (hueClient) {
              const state: any = {};
              if (step.on !== undefined) state.on = step.on;
              if (step.brightness !== undefined) state.bri = step.brightness;
              if (step.colorTemp !== undefined) state.ct = step.colorTemp;
              await hueClient.setGroupState(step.groupId, state);
            }
            break;
          }
          case "hue_light": {
            const hueClient = getHueClient(step.bridgeId);
            if (hueClient) {
              const state: any = {};
              if (step.on !== undefined) state.on = step.on;
              if (step.brightness !== undefined) state.bri = step.brightness;
              if (step.colorTemp !== undefined) state.ct = step.colorTemp;
              await hueClient.setLightState(step.lightId, state);
            }
            break;
          }
        }

        if (step.type !== "delay" && i < steps.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      addSessionLog("macro", "Macro Execute", `Macro "${macro.name}" executed (${steps.length} steps)`);
      res.json({ success: true, message: `Macro "${macro.name}" executed` });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to execute macro" });
    }
  });
}
