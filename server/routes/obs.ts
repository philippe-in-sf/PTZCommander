import { insertObsConnectionSchema, patchObsConnectionSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { logger } from "../logger";
import type { RouteContext } from "./types";

function publicObsConnection<T extends { password?: string | null }>(connection: T) {
  return { ...connection, password: connection.password ? "********" : null };
}

export function registerObsRoutes(ctx: RouteContext) {
  const { app, storage, obsManager, broadcast, addSessionLog } = ctx;

  async function persistCurrentState(id: number, status: string) {
    const state = obsManager.getState();
    await storage.updateObsConnectionStatus(id, status, {
      currentProgramScene: state?.currentProgramScene ?? null,
      studioMode: state?.studioMode ?? false,
    });
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
      const connection = await storage.createObsConnection(parsed.data);
      const connected = await obsManager.connect(connection);
      await persistCurrentState(connection.id, connected ? "online" : "offline");
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
      let client = obsManager.getClient();
      if (!client || !client.isConnected()) {
        const connected = await obsManager.connect(connection);
        await persistCurrentState(id, connected ? "online" : "offline");
        client = obsManager.getClient();
      }
      if (!client || !client.isConnected()) return res.status(503).json({ message: "OBS is not connected" });
      const scenes = await client.getScenes();
      await persistCurrentState(id, "online");
      res.json({ scenes, state: obsManager.getState() });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to fetch OBS scenes" });
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
