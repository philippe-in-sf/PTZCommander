import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { cameraManager } from "./visca";
import { x32Manager } from "./x32";
import { atemManager } from "./atem";
import { logger, setupAuditLogging } from "./logger";
import { insertCameraSchema, insertPresetSchema, insertMixerSchema, insertSwitcherSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  setupAuditLogging();
  logger.info("system", "Application started");

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
      logger.info("camera", `Camera created: ${camera.name}`, { action: "camera:create", details: { cameraId: camera.id, name: camera.name, ip: camera.ip } });
      
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
      logger.info("camera", `Camera deleted`, { action: "camera:delete", details: { cameraId: id } });
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
      logger.info("camera", `Camera set to program`, { action: "camera:program", details: { cameraId: id } });
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
      logger.info("camera", `Camera set to preview`, { action: "camera:preview", details: { cameraId: id } });
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

  // ========== Switcher (ATEM) Routes ==========

  // Get all switchers
  app.get("/api/switchers", async (_req, res) => {
    try {
      const switchers = await storage.getAllSwitchers();
      res.json(switchers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get switchers" });
    }
  });

  // Get single switcher
  app.get("/api/switchers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const switcher = await storage.getSwitcher(id);
      
      if (!switcher) {
        return res.status(404).json({ message: "Switcher not found" });
      }
      
      res.json(switcher);
    } catch (error) {
      res.status(500).json({ message: "Failed to get switcher" });
    }
  });

  // Create switcher
  app.post("/api/switchers", async (req, res) => {
    try {
      const result = insertSwitcherSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: fromError(result.error).toString() 
        });
      }

      const switcher = await storage.createSwitcher(result.data);
      
      // Try to connect to switcher
      const connected = await atemManager.connect(switcher.ip);
      await storage.updateSwitcherStatus(switcher.id, connected ? "online" : "offline");
      
      res.json(switcher);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create switcher" });
    }
  });

  // Update switcher
  app.patch("/api/switchers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertSwitcherSchema.partial().safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: fromError(result.error).toString() 
        });
      }
      
      const switcher = await storage.updateSwitcher(id, result.data);
      
      if (!switcher) {
        return res.status(404).json({ message: "Switcher not found" });
      }
      
      res.json(switcher);
    } catch (error) {
      res.status(500).json({ message: "Failed to update switcher" });
    }
  });

  // Delete switcher
  app.delete("/api/switchers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      atemManager.disconnect();
      await storage.deleteSwitcher(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete switcher" });
    }
  });

  // Connect to switcher
  app.post("/api/switchers/:id/connect", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const switcher = await storage.getSwitcher(id);
      
      if (!switcher) {
        return res.status(404).json({ message: "Switcher not found" });
      }
      
      const connected = await atemManager.connect(switcher.ip);
      await storage.updateSwitcherStatus(id, connected ? "online" : "offline");
      
      res.json({ success: connected, status: connected ? "online" : "offline" });
    } catch (error) {
      res.status(500).json({ message: "Failed to connect to switcher" });
    }
  });

  // Get switcher status/state
  app.get("/api/switchers/:id/status", async (req, res) => {
    try {
      res.json(atemManager.getState() || { connected: false });
    } catch (error) {
      res.status(500).json({ message: "Failed to get switcher status" });
    }
  });

  // ATEM control endpoints
  app.post("/api/switchers/:id/cut", async (req, res) => {
    try {
      const client = atemManager.getClient();
      if (client && client.isConnected()) {
        await client.cut();
        res.json({ success: true });
      } else {
        res.status(503).json({ message: "Switcher not connected" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to execute cut" });
    }
  });

  app.post("/api/switchers/:id/auto", async (req, res) => {
    try {
      const client = atemManager.getClient();
      if (client && client.isConnected()) {
        await client.autoTransition();
        res.json({ success: true });
      } else {
        res.status(503).json({ message: "Switcher not connected" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to execute auto transition" });
    }
  });

  app.post("/api/switchers/:id/program", async (req, res) => {
    try {
      const { inputId } = req.body;
      const client = atemManager.getClient();
      if (client && client.isConnected()) {
        await client.setProgramInput(inputId);
        res.json({ success: true });
      } else {
        res.status(503).json({ message: "Switcher not connected" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to set program input" });
    }
  });

  app.post("/api/switchers/:id/preview", async (req, res) => {
    try {
      const { inputId } = req.body;
      const client = atemManager.getClient();
      if (client && client.isConnected()) {
        await client.setPreviewInput(inputId);
        res.json({ success: true });
      } else {
        res.status(503).json({ message: "Switcher not connected" });
      }
    } catch (error) {
      res.status(500).json({ message: "Failed to set preview input" });
    }
  });

  // ========== Logs API ==========

  // Get recent logs
  app.get("/api/logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const category = req.query.category as string | undefined;
      const logs = await storage.getAuditLogs(limit, category);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get logs" });
    }
  });

  // Get in-memory logs (recent activity)
  app.get("/api/logs/recent", async (_req, res) => {
    try {
      const recentLogs = logger.getRecentLogs(50);
      res.json(recentLogs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get recent logs" });
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

  // Wire ATEM state changes to broadcast to all clients
  atemManager.setStateChangeCallback((state) => {
    broadcast({ type: "atem_state", ...state });
  });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WebSocket] Client connected");
    
    // Send current mixer state to newly connected client
    const mixerClient = x32Manager.getClient();
    if (mixerClient && mixerClient.isConnected()) {
      ws.send(JSON.stringify({
        type: "mixer_state",
        channels: mixerClient.getChannelStates()
      }));
    }

    // Send current ATEM state to newly connected client
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
          case "pan_tilt":
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

          case "pan_tilt_stop":
            const stopClient = cameraManager.getClient(message.cameraId);
            if (stopClient && stopClient.isConnected()) {
              stopClient.panTiltStop();
            } else {
              console.log(`[WebSocket] Camera ${message.cameraId} not connected, skipping pan_tilt_stop`);
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

          // ATEM control messages
          case "atem_cut":
            const atemCutClient = atemManager.getClient();
            if (atemCutClient && atemCutClient.isConnected()) {
              atemCutClient.cut();
            }
            break;

          case "atem_auto":
            const atemAutoClient = atemManager.getClient();
            if (atemAutoClient && atemAutoClient.isConnected()) {
              atemAutoClient.autoTransition();
            }
            break;

          case "atem_program":
            const atemPgmClient = atemManager.getClient();
            if (atemPgmClient && atemPgmClient.isConnected()) {
              atemPgmClient.setProgramInput(message.inputId);
            }
            break;

          case "atem_preview":
            const atemPvwClient = atemManager.getClient();
            if (atemPvwClient && atemPvwClient.isConnected()) {
              atemPvwClient.setPreviewInput(message.inputId);
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
