import { insertObsConnectionSchema, patchObsConnectionSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import type { Response } from "express";
import { logger } from "../logger";
import type { RouteContext } from "./types";
import { publicObsConnection } from "./public-dtos";
import { registerApiAccessRule } from "../auth";
import type { ObsClient } from "../obs";
import { isRehearsalMode } from "../rehearsal";

export function registerObsRoutes(ctx: RouteContext) {
  const { app, storage, obsManager, broadcast, addSessionLog } = ctx;
  registerApiAccessRule(["POST"], /^\/api\/obs\/\d+\/program$/, "operator");
  registerApiAccessRule(["POST"], /^\/api\/obs\/\d+\/recording\/(start|stop|pause|resume)$/, "operator");

  async function persistCurrentState(id: number, status: string) {
    const state = obsManager.getState();
    await storage.updateObsConnectionStatus(id, status, {
      currentProgramScene: state?.currentProgramScene ?? null,
      studioMode: state?.studioMode ?? false,
    });
  }

  async function requireObsClient(id: number, res: Response) {
    const connection = await storage.getObsConnection(id);
    if (!connection) {
      res.status(404).json({ message: "OBS connection not found" });
      return null;
    }

    const client = obsManager.getClient();
    if (!client || !client.isConnected()) {
      res.status(503).json({ message: "OBS is not connected" });
      return null;
    }

    return { connection, client };
  }

  async function runRecordingAction(
    id: number,
    res: Response,
    actionLabel: string,
    action: (client: ObsClient) => Promise<unknown>,
  ) {
    const required = await requireObsClient(id, res);
    if (!required) return;

    if (isRehearsalMode()) {
      const details = `${actionLabel} suppressed by rehearsal mode`;
      addSessionLog("switcher", "OBS Recording", details);
      logger.warn("switcher", details, { action: "obs_recording_suppressed", details: { id, actionLabel } });
      broadcast({ type: "invalidate", keys: ["obs-status"] });
      return res.json({ success: true, suppressed: true, state: obsManager.getState() });
    }

    await action(required.client);
    await persistCurrentState(id, "online");
    addSessionLog("switcher", "OBS Recording", actionLabel);
    logger.info("switcher", actionLabel, { action: "obs_recording", details: { id, actionLabel } });
    broadcast({ type: "obs_state", ...obsManager.getState() });
    broadcast({ type: "invalidate", keys: ["obs-status"] });
    res.json({ success: true, suppressed: false, state: obsManager.getState() });
  }

  app.get("/api/obs", async (_req, res) => {
    try {
      const connections = await storage.getAllObsConnections();
      res.json(connections.map(publicObsConnection));
    } catch {
      res.status(500).json({ message: "Failed to fetch OBS connections" });
    }
  });

  app.post("/api/obs", async (req, res) => {
    try {
      const parsed = insertObsConnectionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });
      const existing = await storage.getAllObsConnections();
      if (existing.length > 0) {
        return res.status(409).json({ message: "PTZ Command currently supports one OBS connection. Update or delete the existing connection instead." });
      }
      const connection = await storage.createObsConnection(parsed.data);
      logger.info("switcher", `OBS connection created: ${connection.name}`, { action: "obs:create", details: { id: connection.id, host: connection.host, port: connection.port } });
      addSessionLog("switcher", "OBS Added", `Added ${connection.name}`);
      broadcast({ type: "invalidate", keys: ["obs"] });
      res.status(201).json(publicObsConnection(await storage.getObsConnection(connection.id) || connection));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create OBS connection" });
    }
  });

  app.patch("/api/obs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const body = { ...req.body };
      if (body.password === "********") delete body.password;
      const parsed = patchObsConnectionSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });
      const existing = await storage.getObsConnection(id);
      if (!existing) return res.status(404).json({ message: "OBS connection not found" });
      const updated = await storage.updateObsConnection(id, parsed.data);
      broadcast({ type: "invalidate", keys: ["obs"] });
      res.json(publicObsConnection(updated || existing));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update OBS connection" });
    }
  });

  app.delete("/api/obs/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      obsManager.disconnect();
      await storage.deleteObsConnection(id);
      broadcast({ type: "invalidate", keys: ["obs"] });
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to delete OBS connection" });
    }
  });

  app.post("/api/obs/:id/connect", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const connection = await storage.getObsConnection(id);
      if (!connection) return res.status(404).json({ message: "OBS connection not found" });
      const connected = await obsManager.connect(connection);
      await persistCurrentState(id, connected ? "online" : "offline");
      broadcast({ type: "invalidate", keys: ["obs"] });
      res.json({ success: connected, status: connected ? "online" : "offline", state: obsManager.getState() });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to connect to OBS" });
    }
  });

  app.post("/api/obs/:id/disconnect", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      obsManager.disconnect();
      await storage.updateObsConnectionStatus(id, "offline");
      broadcast({ type: "invalidate", keys: ["obs"] });
      res.json({ success: true, status: "offline" });
    } catch {
      res.status(500).json({ message: "Failed to disconnect OBS" });
    }
  });

  app.get("/api/obs/:id/status", async (_req, res) => {
    try {
      res.json(obsManager.getState() || { connected: false, scenes: [] });
    } catch {
      res.status(500).json({ message: "Failed to get OBS status" });
    }
  });

  app.get("/api/obs/:id/scenes", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const connection = await storage.getObsConnection(id);
      if (!connection) return res.status(404).json({ message: "OBS connection not found" });
      const client = obsManager.getClient();
      if (!client || !client.isConnected()) return res.status(503).json({ message: "OBS is not connected" });
      const scenes = await client.getScenes();
      await persistCurrentState(id, "online");
      res.json({ scenes, state: obsManager.getState() });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch OBS scenes" });
    }
  });

  app.get("/api/obs/:id/recording", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const connection = await storage.getObsConnection(id);
      if (!connection) return res.status(404).json({ message: "OBS connection not found" });

      const client = obsManager.getClient();
      if (client && client.isConnected()) {
        await client.refreshRecordingStatus();
        await persistCurrentState(id, "online");
        broadcast({ type: "obs_state", ...obsManager.getState() });
      }

      res.json({ success: true, state: obsManager.getState() || { connected: false, scenes: [] } });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to get OBS recording status" });
    }
  });

  app.post("/api/obs/:id/recording/start", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await runRecordingAction(id, res, "Recording started", async (client) => {
        await client.startRecording();
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to start OBS recording" });
    }
  });

  app.post("/api/obs/:id/recording/stop", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await runRecordingAction(id, res, "Recording stopped", async (client) => {
        await client.stopRecording();
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to stop OBS recording" });
    }
  });

  app.post("/api/obs/:id/recording/pause", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await runRecordingAction(id, res, "Recording paused", async (client) => {
        await client.pauseRecording();
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to pause OBS recording" });
    }
  });

  app.post("/api/obs/:id/recording/resume", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await runRecordingAction(id, res, "Recording resumed", async (client) => {
        await client.resumeRecording();
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to resume OBS recording" });
    }
  });

  app.post("/api/obs/:id/program", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const sceneName = String(req.body?.sceneName || "").trim();
      if (!sceneName) return res.status(400).json({ message: "sceneName is required" });
      const client = obsManager.getClient();
      if (!client || !client.isConnected()) return res.status(503).json({ message: "OBS is not connected" });
      await client.setCurrentProgramScene(sceneName);
      await persistCurrentState(id, "online");
      addSessionLog("switcher", "OBS Scene", `Program scene set to ${sceneName}`);
      broadcast({ type: "obs_state", ...obsManager.getState() });
      res.json({ success: true, state: obsManager.getState() });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to switch OBS scene" });
    }
  });
}
