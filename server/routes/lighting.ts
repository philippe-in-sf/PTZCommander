import type { RouteContext } from "./types";
import { insertHueBridgeSchema, patchHueBridgeSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { pairBridge, getHueClient, setHueClient, removeHueClient } from "../hue";

export function registerLightingRoutes(ctx: RouteContext) {
  const { app, storage, addSessionLog } = ctx;

  app.get("/api/hue/bridges", async (_req, res) => {
    const bridges = await storage.getAllHueBridges();
    res.json(bridges);
  });

  app.post("/api/hue/bridges", async (req, res) => {
    const parsed = insertHueBridgeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: fromError(parsed.error).message });
    const bridge = await storage.createHueBridge(parsed.data);
    if (bridge.apiKey) {
      setHueClient(bridge.id, bridge.ip, bridge.apiKey);
      const online = await getHueClient(bridge.id)?.ping();
      await storage.updateHueBridge(bridge.id, { status: online ? "online" : "offline" });
      bridge.status = online ? "online" : "offline";
    }
    res.json(bridge);
  });

  app.patch("/api/hue/bridges/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = patchHueBridgeSchema.safeParse(req.body);
      if (!result.success) return res.status(400).json({ error: fromError(result.error).message });
      const bridge = await storage.updateHueBridge(id, result.data);
      if (!bridge) return res.status(404).json({ error: "Bridge not found" });
      res.json(bridge);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to update bridge";
      res.status(500).json({ error: message });
    }
  });

  app.delete("/api/hue/bridges/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    removeHueClient(id);
    await storage.deleteHueBridge(id);
    res.json({ success: true });
  });

  app.post("/api/hue/bridges/:id/pair", async (req, res) => {
    const id = parseInt(req.params.id);
    const bridge = await storage.getHueBridge(id);
    if (!bridge) return res.status(404).json({ error: "Bridge not found" });
    const apiKey = await pairBridge(bridge.ip);
    if (!apiKey) return res.status(400).json({ error: "Pairing failed — press the link button on your Hue bridge, then try again" });
    await storage.updateHueBridge(id, { apiKey, status: "online" });
    setHueClient(id, bridge.ip, apiKey);
    res.json({ success: true, apiKey });
  });

  app.get("/api/hue/bridges/:id/lights", async (req, res) => {
    const id = parseInt(req.params.id);
    const client = getHueClient(id);
    if (!client) return res.status(404).json({ error: "Bridge not connected" });
    try {
      const lights = await client.getLights();
      res.json(lights);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/hue/bridges/:id/groups", async (req, res) => {
    const id = parseInt(req.params.id);
    const client = getHueClient(id);
    if (!client) return res.status(404).json({ error: "Bridge not connected" });
    try {
      const groups = await client.getGroups();
      res.json(groups);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/hue/bridges/:id/scenes", async (req, res) => {
    const id = parseInt(req.params.id);
    const client = getHueClient(id);
    if (!client) return res.status(404).json({ error: "Bridge not connected" });
    try {
      const scenes = await client.getScenes();
      res.json(scenes);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/hue/bridges/:id/lights/:lightId", async (req, res) => {
    const id = parseInt(req.params.id);
    const client = getHueClient(id);
    if (!client) return res.status(404).json({ error: "Bridge not connected" });
    try {
      const result = await client.setLightState(req.params.lightId, req.body);
      addSessionLog("system", "Hue Light", `Light ${req.params.lightId} updated`);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.put("/api/hue/bridges/:id/groups/:groupId", async (req, res) => {
    const id = parseInt(req.params.id);
    const client = getHueClient(id);
    if (!client) return res.status(404).json({ error: "Bridge not connected" });
    try {
      const result = await client.setGroupState(req.params.groupId, req.body);
      addSessionLog("system", "Hue Group", `Group ${req.params.groupId} updated`);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/hue/bridges/:id/scenes/:sceneId/activate", async (req, res) => {
    const id = parseInt(req.params.id);
    const client = getHueClient(id);
    if (!client) return res.status(404).json({ error: "Bridge not connected" });
    try {
      const result = await client.activateScene(req.params.sceneId, req.body.groupId);
      addSessionLog("system", "Hue Scene", `Scene ${req.params.sceneId} activated`);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
}
