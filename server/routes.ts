import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { cameraManager } from "./visca";
import { x32Manager } from "./x32";
import { atemManager } from "./atem";
import { logger, setupAuditLogging } from "./logger";
import { insertCameraSchema, insertPresetSchema, insertMixerSchema, insertSwitcherSchema, insertSceneButtonSchema } from "@shared/schema";
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
        logger.warn("mixer", `Failed to create mixer: validation error`, { details: { error: fromError(result.error).toString() } });
        return res.status(400).json({ 
          message: fromError(result.error).toString() 
        });
      }

      const mixer = await storage.createMixer(result.data);
      logger.info("mixer", `Mixer created: ${mixer.name}`, { action: "create", details: { mixerId: mixer.id, name: mixer.name, ip: mixer.ip, port: mixer.port } });
      
      // Try to connect to mixer
      const connected = await x32Manager.connect(mixer.ip, mixer.port);
      await storage.updateMixerStatus(mixer.id, connected ? "online" : "offline");
      
      if (connected) {
        logger.info("mixer", `Mixer connected after creation: ${mixer.name} at ${mixer.ip}:${mixer.port}`, { action: "connect", details: { mixerId: mixer.id, ip: mixer.ip, port: mixer.port } });
      } else {
        logger.warn("mixer", `Mixer created but failed to connect: ${mixer.name} at ${mixer.ip}:${mixer.port}`, { action: "connect_failed", details: { mixerId: mixer.id, ip: mixer.ip, port: mixer.port } });
      }
      
      res.json(mixer);
    } catch (error: any) {
      logger.error("mixer", `Failed to create mixer: ${error.message}`, { action: "create_error", details: { error: error.message } });
      res.status(500).json({ message: error.message || "Failed to create mixer" });
    }
  });

  // Update mixer
  app.patch("/api/mixers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = insertMixerSchema.partial().safeParse(req.body);
      
      if (!result.success) {
        logger.warn("mixer", `Failed to update mixer ${id}: validation error`, { details: { error: fromError(result.error).toString() } });
        return res.status(400).json({ 
          message: fromError(result.error).toString() 
        });
      }
      
      const mixer = await storage.updateMixer(id, result.data);
      
      if (!mixer) {
        logger.warn("mixer", `Mixer ${id} not found for update`, { action: "update_not_found", details: { mixerId: id } });
        return res.status(404).json({ message: "Mixer not found" });
      }
      
      logger.info("mixer", `Mixer updated: ${mixer.name}`, { action: "update", details: { mixerId: id, updates: result.data } });
      res.json(mixer);
    } catch (error: any) {
      logger.error("mixer", `Failed to update mixer: ${error.message}`, { action: "update_error", details: { error: error.message } });
      res.status(500).json({ message: "Failed to update mixer" });
    }
  });

  // Delete mixer
  app.delete("/api/mixers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      logger.info("mixer", `Deleting mixer ${id} and disconnecting`, { action: "delete", details: { mixerId: id } });
      x32Manager.disconnect();
      await storage.deleteMixer(id);
      logger.info("mixer", `Mixer ${id} deleted successfully`, { action: "deleted", details: { mixerId: id } });
      res.json({ success: true });
    } catch (error: any) {
      logger.error("mixer", `Failed to delete mixer: ${error.message}`, { action: "delete_error", details: { error: error.message } });
      res.status(500).json({ message: "Failed to delete mixer" });
    }
  });

  // Connect to mixer
  app.post("/api/mixers/:id/connect", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const mixer = await storage.getMixer(id);
      
      if (!mixer) {
        logger.warn("mixer", `Mixer ${id} not found for connection`, { action: "connect_not_found", details: { mixerId: id } });
        return res.status(404).json({ message: "Mixer not found" });
      }
      
      logger.info("mixer", `Connecting to mixer: ${mixer.name} at ${mixer.ip}:${mixer.port}`, { action: "connecting", details: { mixerId: id, ip: mixer.ip, port: mixer.port } });
      const connected = await x32Manager.connect(mixer.ip, mixer.port);
      await storage.updateMixerStatus(id, connected ? "online" : "offline");
      
      if (connected) {
        logger.info("mixer", `Connected to mixer: ${mixer.name}`, { action: "connected", details: { mixerId: id, ip: mixer.ip, port: mixer.port } });
      } else {
        logger.warn("mixer", `Failed to connect to mixer: ${mixer.name} at ${mixer.ip}:${mixer.port}`, { action: "connect_failed", details: { mixerId: id, ip: mixer.ip, port: mixer.port } });
      }
      
      res.json({ success: connected, status: connected ? "online" : "offline" });
    } catch (error: any) {
      logger.error("mixer", `Connection error: ${error.message}`, { action: "connect_error", details: { error: error.message } });
      res.status(500).json({ message: "Failed to connect to mixer" });
    }
  });

  // Get mixer status
  app.get("/api/mixers/:id/status", async (req, res) => {
    try {
      const client = x32Manager.getClient();
      res.json({ 
        connected: x32Manager.isConnected(),
        channels: client?.getChannelStates() || [],
        sections: client?.getAllStates() || {}
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

  // ========== Scene Button Routes ==========

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
      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to execute scene button" });
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
  x32Manager.setStateChangeCallback((section, states) => {
    broadcast({ type: "mixer_state", section, channels: states });
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

          // Mixer control messages (generic section-based)
          case "mixer_section_fader":
            const secFaderClient = x32Manager.getClient();
            if (secFaderClient && secFaderClient.isConnected()) {
              secFaderClient.setSectionFader(message.section, message.channel, message.value);
              logger.debug("mixer", `${message.section}/${message.channel} fader set to ${message.value.toFixed(2)}`, { action: "fader_change", details: { section: message.section, channel: message.channel, value: message.value } });
            } else {
              logger.warn("mixer", `Fader change ignored - mixer not connected`, { action: "fader_no_connection", details: { section: message.section, channel: message.channel } });
            }
            break;

          case "mixer_section_mute":
            const secMuteClient = x32Manager.getClient();
            if (secMuteClient && secMuteClient.isConnected()) {
              secMuteClient.setSectionMute(message.section, message.channel, message.muted);
              logger.info("mixer", `${message.section}/${message.channel} ${message.muted ? "muted" : "unmuted"}`, { action: "mute_toggle", details: { section: message.section, channel: message.channel, muted: message.muted } });
            } else {
              logger.warn("mixer", `Mute toggle ignored - mixer not connected`, { action: "mute_no_connection", details: { section: message.section, channel: message.channel } });
            }
            break;

          // Legacy mixer messages (backward compatible with summary panel)
          case "mixer_fader":
            const mixerClient = x32Manager.getClient();
            if (mixerClient && mixerClient.isConnected()) {
              mixerClient.setChannelFader(message.channel, message.value);
              logger.debug("mixer", `Channel ${message.channel} fader set to ${message.value.toFixed(2)}`, { action: "fader_change", details: { channel: message.channel, value: message.value } });
            }
            break;

          case "mixer_mute":
            const muteClient = x32Manager.getClient();
            if (muteClient && muteClient.isConnected()) {
              muteClient.setChannelMute(message.channel, message.muted);
              logger.info("mixer", `Channel ${message.channel} ${message.muted ? "muted" : "unmuted"}`, { action: "mute_toggle", details: { channel: message.channel, muted: message.muted } });
            }
            break;

          case "mixer_main_fader":
            const mainClient = x32Manager.getClient();
            if (mainClient && mainClient.isConnected()) {
              mainClient.setMainFader(message.value);
              logger.debug("mixer", `Main fader set to ${message.value.toFixed(2)}`, { action: "main_fader_change", details: { value: message.value } });
            }
            break;

          case "mixer_main_mute":
            const mainMuteClient = x32Manager.getClient();
            if (mainMuteClient && mainMuteClient.isConnected()) {
              mainMuteClient.setMainMute(message.muted);
              logger.info("mixer", `Main output ${message.muted ? "muted" : "unmuted"}`, { action: "main_mute_toggle", details: { muted: message.muted } });
            }
            break;

          case "mixer_query_section":
            const queryClient2 = x32Manager.getClient();
            if (queryClient2 && queryClient2.isConnected()) {
              queryClient2.querySectionState(message.section);
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

          case "atem_ftb":
            const atemFtbClient = atemManager.getClient();
            if (atemFtbClient && atemFtbClient.isConnected()) {
              atemFtbClient.fadeToBlack();
            }
            break;

          case "atem_transition_style":
            const atemStyleClient = atemManager.getClient();
            if (atemStyleClient && atemStyleClient.isConnected()) {
              atemStyleClient.setTransitionStyle(message.style);
            }
            break;

          case "atem_transition_preview":
            const atemPrevClient = atemManager.getClient();
            if (atemPrevClient && atemPrevClient.isConnected()) {
              atemPrevClient.setTransitionPreview(message.enabled);
            }
            break;

          case "atem_transition_position":
            const atemPosClient = atemManager.getClient();
            if (atemPosClient && atemPosClient.isConnected()) {
              atemPosClient.setTransitionPosition(message.position);
            }
            break;

          case "atem_mix_rate":
            const atemMixRateClient = atemManager.getClient();
            if (atemMixRateClient && atemMixRateClient.isConnected()) {
              atemMixRateClient.setMixRate(message.rate);
            }
            break;

          case "atem_ftb_rate":
            const atemFtbRateClient = atemManager.getClient();
            if (atemFtbRateClient && atemFtbRateClient.isConnected()) {
              atemFtbRateClient.setFadeToBlackRate(message.rate);
            }
            break;

          case "atem_dsk_on_air":
            const atemDskAirClient = atemManager.getClient();
            if (atemDskAirClient && atemDskAirClient.isConnected()) {
              atemDskAirClient.setDSKOnAir(message.index, message.onAir);
            }
            break;

          case "atem_dsk_tie":
            const atemDskTieClient = atemManager.getClient();
            if (atemDskTieClient && atemDskTieClient.isConnected()) {
              atemDskTieClient.setDSKTie(message.index, message.tie);
            }
            break;

          case "atem_dsk_auto":
            const atemDskAutoClient = atemManager.getClient();
            if (atemDskAutoClient && atemDskAutoClient.isConnected()) {
              atemDskAutoClient.autoDSK(message.index);
            }
            break;

          case "atem_dsk_rate":
            const atemDskRateClient = atemManager.getClient();
            if (atemDskRateClient && atemDskRateClient.isConnected()) {
              atemDskRateClient.setDSKRate(message.index, message.rate);
            }
            break;

          case "atem_usk_on_air":
            const atemUskClient = atemManager.getClient();
            if (atemUskClient && atemUskClient.isConnected()) {
              atemUskClient.setUSKOnAir(message.index, message.onAir);
            }
            break;

          case "atem_macro_run":
            const atemMacroRunClient = atemManager.getClient();
            if (atemMacroRunClient && atemMacroRunClient.isConnected()) {
              atemMacroRunClient.runMacro(message.index);
            }
            break;

          case "atem_macro_stop":
            const atemMacroStopClient = atemManager.getClient();
            if (atemMacroStopClient && atemMacroStopClient.isConnected()) {
              atemMacroStopClient.stopMacro();
            }
            break;

          case "atem_macro_continue":
            const atemMacroContinueClient = atemManager.getClient();
            if (atemMacroContinueClient && atemMacroContinueClient.isConnected()) {
              atemMacroContinueClient.continueMacro();
            }
            break;

          case "atem_aux_source":
            const atemAuxClient = atemManager.getClient();
            if (atemAuxClient && atemAuxClient.isConnected()) {
              atemAuxClient.setAuxSource(message.auxIndex, message.sourceId);
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
