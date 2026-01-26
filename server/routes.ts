import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { cameraManager } from "./visca";
import { x32Manager } from "./x32";
import { insertCameraSchema, insertPresetSchema, insertMixerSchema } from "@shared/schema";
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

  // ========== Mixer Routes ==========

  // Get all mixers
  app.get("/api/mixers", async (_req, res) => {
    try {
      const mixers = await storage.getAllMixers();
      res.json(mixers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get mixers" });
    }
  });

  // Get single mixer
  app.get("/api/mixers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const mixer = await storage.getMixer(id);
      
      if (!mixer) {
        return res.status(404).json({ message: "Mixer not found" });
      }
      
      res.json(mixer);
    } catch (error) {
      res.status(500).json({ message: "Failed to get mixer" });
    }
  });

  // Create mixer
  app.post("/api/mixers", async (req, res) => {
    try {
      const result = insertMixerSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: fromError(result.error).toString() 
        });
      }

      const mixer = await storage.createMixer(result.data);
      
      // Try to connect to mixer
      const connected = await x32Manager.connect(mixer.ip, mixer.port);
      await storage.updateMixerStatus(mixer.id, connected ? "online" : "offline");
      
      res.json(mixer);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create mixer" });
    }
  });

  // Update mixer
  app.patch("/api/mixers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertMixerSchema.partial().safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: fromError(result.error).toString() 
        });
      }
      
      const mixer = await storage.updateMixer(id, result.data);
      
      if (!mixer) {
        return res.status(404).json({ message: "Mixer not found" });
      }
      
      res.json(mixer);
    } catch (error) {
      res.status(500).json({ message: "Failed to update mixer" });
    }
  });

  // Delete mixer
  app.delete("/api/mixers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      x32Manager.disconnect();
      await storage.deleteMixer(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete mixer" });
    }
  });

  // Connect to mixer
  app.post("/api/mixers/:id/connect", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const mixer = await storage.getMixer(id);
      
      if (!mixer) {
        return res.status(404).json({ message: "Mixer not found" });
      }
      
      const connected = await x32Manager.connect(mixer.ip, mixer.port);
      await storage.updateMixerStatus(id, connected ? "online" : "offline");
      
      res.json({ success: connected, status: connected ? "online" : "offline" });
    } catch (error) {
      res.status(500).json({ message: "Failed to connect to mixer" });
    }
  });

  // Get mixer status
  app.get("/api/mixers/:id/status", async (req, res) => {
    try {
      res.json({ 
        connected: x32Manager.isConnected(),
        channels: x32Manager.getClient()?.getChannelStates() || []
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get mixer status" });
    }
  });

  // ========== WebSocket Server for Real-time Control ==========
  
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Helper to broadcast to all connected clients
  function broadcast(message: any) {
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  // Wire X32 state changes to broadcast to all clients
  // This is set on the manager so it persists across connect/disconnect cycles
  x32Manager.setStateChangeCallback((states) => {
    broadcast({ type: "mixer_state", channels: states });
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WebSocket] Client connected");
    
    // Send current mixer state to newly connected client
    const client = x32Manager.getClient();
    if (client && client.isConnected()) {
      ws.send(JSON.stringify({
        type: "mixer_state",
        channels: client.getChannelStates()
      }));
    }

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

          // Mixer control messages
          case "mixer_fader":
            const mixerClient = x32Manager.getClient();
            if (mixerClient && mixerClient.isConnected()) {
              mixerClient.setChannelFader(message.channel, message.value);
            }
            break;

          case "mixer_mute":
            const muteClient = x32Manager.getClient();
            if (muteClient && muteClient.isConnected()) {
              muteClient.setChannelMute(message.channel, message.muted);
            }
            break;

          case "mixer_main_fader":
            const mainClient = x32Manager.getClient();
            if (mainClient && mainClient.isConnected()) {
              mainClient.setMainFader(message.value);
            }
            break;

          case "mixer_main_mute":
            const mainMuteClient = x32Manager.getClient();
            if (mainMuteClient && mainMuteClient.isConnected()) {
              mainMuteClient.setMainMute(message.muted);
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

  // Initialize camera connections on startup (non-blocking)
  // This runs asynchronously after server starts
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
  }, 1000);

  return httpServer;
}
