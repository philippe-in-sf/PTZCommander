import type { RouteContext } from "./types";
import { insertCameraSchema, insertPresetSchema } from "@shared/schema";
import { logger } from "../logger";
import { fromError } from "zod-validation-error";

export function registerCameraRoutes(ctx: RouteContext) {
  const { app, storage, cameraManager, broadcast, pushUndo, addSessionLog, captureSnapshot } = ctx;

  app.get("/api/cameras", async (_req, res) => {
    try {
      const cameras = await storage.getAllCameras();
      res.json(cameras);
    } catch (error) {
      res.status(500).json({ message: "Failed to get cameras" });
    }
  });

  app.get("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const camera = await storage.getCamera(id);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }
      res.json(camera);
    } catch (error) {
      res.status(500).json({ message: "Failed to get camera" });
    }
  });

  app.post("/api/cameras", async (req, res) => {
    try {
      const result = insertCameraSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const camera = await storage.createCamera(result.data);
      logger.info("camera", `Camera created: ${camera.name}`, { action: "camera:create", details: { cameraId: camera.id, name: camera.name, ip: camera.ip } });
      const connected = await cameraManager.connectCamera(camera.id, camera.ip, camera.port);
      await storage.updateCameraStatus(camera.id, connected ? "online" : "offline");
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json(camera);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create camera" });
    }
  });

  app.patch("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const camera = await storage.updateCamera(id, req.body);
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json(camera);
    } catch (error) {
      res.status(500).json({ message: "Failed to update camera" });
    }
  });

  app.delete("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      cameraManager.disconnectCamera(id);
      const camPresets = await storage.getPresetsForCamera(id);
      for (const p of camPresets) await storage.deletePreset(p.id);
      await storage.deleteCamera(id);
      logger.info("camera", `Camera deleted`, { action: "camera:delete", details: { cameraId: id } });
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete camera" });
    }
  });

  app.post("/api/cameras/:id/program", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.setProgramCamera(id);
      logger.info("camera", `Camera set to program`, { action: "camera:program", details: { cameraId: id } });
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to set program camera" });
    }
  });

  app.post("/api/cameras/:id/preview", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.setPreviewCamera(id);
      logger.info("camera", `Camera set to preview`, { action: "camera:preview", details: { cameraId: id } });
      broadcast({ type: "invalidate", keys: ["cameras"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to set preview camera" });
    }
  });

  app.get("/api/cameras/:id/snapshot", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const camera = await storage.getCamera(id);
      if (!camera) return res.status(404).json({ message: "Camera not found" });
      if (!camera.streamUrl) return res.status(404).json({ message: "No stream URL configured" });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(camera.streamUrl, {
          signal: controller.signal,
          headers: camera.username && camera.password
            ? { 'Authorization': 'Basic ' + Buffer.from(`${camera.username}:${camera.password}`).toString('base64') }
            : {},
        });
        clearTimeout(timeout);

        if (!response.ok) {
          return res.status(502).json({ message: `Camera returned ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
      } catch (fetchError: any) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          return res.status(504).json({ message: "Camera snapshot timed out" });
        }
        return res.status(502).json({ message: `Failed to reach camera: ${fetchError.message}` });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get snapshot" });
    }
  });

  app.get("/api/cameras/:id/presets", async (req, res) => {
    try {
      const cameraId = parseInt(req.params.id);
      const presets = await storage.getPresetsForCamera(cameraId);
      res.json(presets);
    } catch (error) {
      res.status(500).json({ message: "Failed to get presets" });
    }
  });

  app.post("/api/presets", async (req, res) => {
    try {
      const result = insertPresetSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }

      let thumbnailData = result.data.thumbnail || null;
      if (!thumbnailData) {
        try {
          const camera = await storage.getCamera(result.data.cameraId);
          if (camera?.streamUrl) {
            thumbnailData = await captureSnapshot(camera.streamUrl);
          }
        } catch {}
      }

      const preset = await storage.savePreset({ ...result.data, thumbnail: thumbnailData });

      const client = cameraManager.getClient(result.data.cameraId);
      if (client && client.isConnected()) {
        client.storePreset(result.data.presetNumber);
      }

      addSessionLog("preset", "Store Preset", `Preset ${result.data.presetNumber + 1}${result.data.name ? ` (${result.data.name})` : ""} saved`);
      broadcast({ type: "invalidate", keys: ["presets"] });
      res.json(preset);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to save preset" });
    }
  });

  app.post("/api/presets/:id/recall", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const preset = await storage.getPresetById(id);
      if (!preset) {
        return res.status(404).json({ message: "Preset not found" });
      }

      const cam = await storage.getCamera(preset.cameraId);
      if (!cam) {
        return res.status(404).json({ message: "Camera not found" });
      }

      const client = cameraManager.getClient(cam.id);
      if (!client || !client.isConnected()) {
        return res.status(404).json({ message: "Camera offline" });
      }

      const previousPreset = req.body?.previousPresetId;
      if (previousPreset) {
        pushUndo({
          type: "preset_recall",
          description: `Recall preset "${preset.name || preset.presetNumber + 1}" on ${cam.name}`,
          timestamp: Date.now(),
          undo: async () => {
            const prevP = await storage.getPresetById(previousPreset);
            if (prevP) {
              const c = cameraManager.getClient(cam.id);
              if (c && c.isConnected()) c.recallPreset(prevP.presetNumber);
            }
          },
        });
      }

      client.recallPreset(preset.presetNumber);
      addSessionLog("preset", "Recall Preset", `Preset ${preset.presetNumber + 1}${preset.name ? ` (${preset.name})` : ""} on ${cam.name}`);
      return res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to recall preset" });
    }
  });

  app.delete("/api/presets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePreset(id);
      broadcast({ type: "invalidate", keys: ["presets"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete preset" });
    }
  });
}
