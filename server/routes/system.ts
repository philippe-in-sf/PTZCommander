import type { RouteContext } from "./types";
import { logger } from "../logger";
import { APP_VERSION } from "@shared/version";
import { readFileSync } from "fs";
import { join } from "path";

export function registerSystemRoutes(ctx: RouteContext) {
  const { app, storage, cameraManager, x32Manager, atemManager, broadcast, undoStack, sessionLog, addSessionLog } = ctx;

  app.get("/api/version", (_req, res) => {
    res.json({ version: APP_VERSION });
  });

  app.get("/api/mobile/config", (_req, res) => {
    res.json({
      appName: "PTZ Command",
      version: APP_VERSION,
      websocketPath: "/ws",
      features: {
        cameras: true,
        presets: true,
        scenes: true,
        macros: true,
        runsheet: true,
        lighting: true,
        displays: true,
        switcher: true,
        mixer: true,
      },
      endpoints: {
        cameras: "/api/cameras",
        scenes: "/api/scene-buttons",
        macros: "/api/macros",
        runsheet: "/api/runsheet/cues",
        displays: "/api/displays",
        deviceHealth: "/api/health/devices",
      },
    });
  });

  app.get("/api/changelog", (_req, res) => {
    try {
      const content = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf-8");
      res.json({ changelog: content });
    } catch {
      res.status(404).json({ message: "Changelog not found" });
    }
  });

  app.get("/api/undo/status", (_req, res) => {
    const last = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
    res.json({
      canUndo: undoStack.length > 0,
      count: undoStack.length,
      lastAction: last ? { type: last.type, description: last.description, timestamp: last.timestamp } : null,
    });
  });

  app.post("/api/undo", async (_req, res) => {
    if (undoStack.length === 0) {
      return res.status(400).json({ message: "Nothing to undo" });
    }
    const action = undoStack.pop()!;
    try {
      await action.undo();
      addSessionLog("system", "Undo", `Undid: ${action.description}`);
      logger.info("system", `Undo: ${action.description}`, { action: "undo" });
      broadcast({ type: "invalidate", keys: ["undo-status", "cameras", "presets"] });
      res.json({ success: true, message: `Undid: ${action.description}` });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to undo" });
    }
  });

  app.get("/api/session-log", (_req, res) => {
    res.json(sessionLog);
  });

  app.delete("/api/session-log", (_req, res) => {
    sessionLog.length = 0;
    res.json({ success: true });
  });

  app.get("/api/health/devices", async (_req, res) => {
    try {
      const cameras = await storage.getAllCameras();
      const mixers = await storage.getAllMixers();
      const switchers = await storage.getAllSwitchers();
      const displays = await storage.getAllDisplayDevices();

      const cameraHealth = cameras.map(cam => {
        const client = cameraManager.getClient(cam.id);
        return {
          type: "camera" as const,
          id: cam.id,
          name: cam.name,
          ip: cam.ip,
          port: cam.port,
          status: client?.isConnected() ? "online" : "offline",
          tallyState: cam.tallyState,
        };
      });

      const mixerHealth = mixers.map(m => {
        const client = x32Manager.getClient();
        return {
          type: "mixer" as const,
          id: m.id,
          name: m.name,
          ip: m.ip,
          port: m.port,
          status: client?.isConnected() ? "online" : "offline",
        };
      });

      const switcherHealth = switchers.map(s => {
        const atemState = atemManager.getState();
        return {
          type: "switcher" as const,
          id: s.id,
          name: s.name,
          ip: s.ip,
          status: atemState?.connected ? "online" : "offline",
        };
      });

      const displayHealth = displays.map(display => ({
        type: "display" as const,
        id: display.id,
        name: display.name,
        ip: display.ip,
        status: display.status,
        powerState: display.powerState,
        inputSource: display.inputSource,
      }));

      res.json({
        cameras: cameraHealth,
        mixers: mixerHealth,
        switchers: switcherHealth,
        displays: displayHealth,
        timestamp: Date.now(),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get device health" });
    }
  });

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

  app.get("/api/logs/recent", async (_req, res) => {
    try {
      const recentLogs = logger.getRecentLogs(50);
      res.json(recentLogs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get recent logs" });
    }
  });
}
