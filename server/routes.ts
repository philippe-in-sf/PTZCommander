import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { cameraManager } from "./visca";
import { insertCameraSchema, insertPresetSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ========== Camera Routes ==========
  
  // Get all cameras
  app.get("/api/cameras", async (_req, res) => {
    try {
      const cameras = await storage.getAllCameras();
      res.json(cameras);
    } catch (error) {
      res.status(500).json({ message: "Failed to get cameras" });
    }
  });

  // Get single camera
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

  // Create camera
  app.post("/api/cameras", async (req, res) => {
    try {
      const result = insertCameraSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: fromError(result.error).toString() 
        });
      }

      const camera = await storage.createCamera(result.data);
      
      // Try to connect to camera
      const connected = await cameraManager.connectCamera(camera.id, camera.ip, camera.port);
      await storage.updateCameraStatus(camera.id, connected ? "online" : "offline");
      
      res.json(camera);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create camera" });
    }
  });

  // Update camera
  app.patch("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const camera = await storage.updateCamera(id, req.body);
      
      if (!camera) {
        return res.status(404).json({ message: "Camera not found" });
      }
      
      res.json(camera);
    } catch (error) {
      res.status(500).json({ message: "Failed to update camera" });
    }
  });

  // Delete camera
  app.delete("/api/cameras/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      cameraManager.disconnectCamera(id);
      await storage.deleteCamera(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete camera" });
    }
  });

  // Set program camera
  app.post("/api/cameras/:id/program", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.setProgramCamera(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to set program camera" });
    }
  });

  // Set preview camera
  app.post("/api/cameras/:id/preview", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.setPreviewCamera(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to set preview camera" });
    }
  });

  // ========== Preset Routes ==========
  
  // Get presets for camera
  app.get("/api/cameras/:id/presets", async (req, res) => {
    try {
      const cameraId = parseInt(req.params.id);
      const presets = await storage.getPresetsForCamera(cameraId);
      res.json(presets);
    } catch (error) {
      res.status(500).json({ message: "Failed to get presets" });
    }
  });

  // Save preset
  app.post("/api/presets", async (req, res) => {
    try {
      const result = insertPresetSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: fromError(result.error).toString() 
        });
      }

      const preset = await storage.savePreset(result.data);
      
      // Store on physical camera if connected
      const client = cameraManager.getClient(result.data.cameraId);
      if (client && client.isConnected()) {
        client.storePreset(result.data.presetNumber);
      }
      
      res.json(preset);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to save preset" });
    }
  });

  // Recall preset
  app.post("/api/presets/:id/recall", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get preset from database
      const cameras = await storage.getAllCameras();
      for (const cam of cameras) {
        const presets = await storage.getPresetsForCamera(cam.id);
        const preset = presets.find(p => p.id === id);
        
        if (preset) {
          const client = cameraManager.getClient(cam.id);
          if (client && client.isConnected()) {
            client.recallPreset(preset.presetNumber);
            return res.json({ success: true });
          }
        }
      }
      
      res.status(404).json({ message: "Preset not found or camera offline" });
    } catch (error) {
      res.status(500).json({ message: "Failed to recall preset" });
    }
  });

  // Delete preset
  app.delete("/api/presets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePreset(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete preset" });
    }
  });

  // ========== WebSocket Server for Real-time Control ==========
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WebSocket] Client connected");

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case "pan_tilt":
            const { cameraId, pan, tilt, speed } = message;
            const client = cameraManager.getClient(cameraId);
            if (client && client.isConnected()) {
              client.panTilt(pan, tilt, speed || 0.5);
            }
            break;

          case "pan_tilt_stop":
            const stopClient = cameraManager.getClient(message.cameraId);
            if (stopClient && stopClient.isConnected()) {
              stopClient.panTiltStop();
            }
            break;

          case "zoom":
            const zoomClient = cameraManager.getClient(message.cameraId);
            if (zoomClient && zoomClient.isConnected()) {
              zoomClient.zoom(message.zoom, message.speed || 0.5);
            }
            break;

          case "focus_auto":
            const focusClient = cameraManager.getClient(message.cameraId);
            if (focusClient && focusClient.isConnected()) {
              focusClient.focusAuto();
            }
            break;

          case "recall_preset":
            const recallClient = cameraManager.getClient(message.cameraId);
            if (recallClient && recallClient.isConnected()) {
              recallClient.recallPreset(message.presetNumber);
            }
            break;
        }
      } catch (error) {
        console.error("[WebSocket] Error processing message:", error);
      }
    });

    ws.on("close", () => {
      console.log("[WebSocket] Client disconnected");
    });
  });

  // Initialize camera connections on startup
  const cameras = await storage.getAllCameras();
  for (const camera of cameras) {
    const connected = await cameraManager.connectCamera(camera.id, camera.ip, camera.port);
    await storage.updateCameraStatus(camera.id, connected ? "online" : "offline");
  }

  return httpServer;
}
