import type { RouteContext } from "./types";
import { patchMixerSchema, insertMixerSchema } from "@shared/schema";
import { logger } from "../logger";
import { fromError } from "zod-validation-error";

export function registerMixerRoutes(ctx: RouteContext) {
  const { app, storage, x32Manager, broadcast } = ctx;

  app.get("/api/mixers", async (_req, res) => {
    try {
      const mixers = await storage.getAllMixers();
      res.json(mixers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get mixers" });
    }
  });

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

  app.post("/api/mixers", async (req, res) => {
    try {
      const result = insertMixerSchema.safeParse(req.body);
      if (!result.success) {
        logger.warn("mixer", `Failed to create mixer: validation error`, { details: { error: fromError(result.error).toString() } });
        return res.status(400).json({ message: fromError(result.error).toString() });
      }

      const mixer = await storage.createMixer(result.data);
      logger.info("mixer", `Mixer created: ${mixer.name}`, { action: "create", details: { mixerId: mixer.id, name: mixer.name, ip: mixer.ip, port: mixer.port } });

      const connected = await x32Manager.connect(mixer.ip, mixer.port);
      await storage.updateMixerStatus(mixer.id, connected ? "online" : "offline");

      if (connected) {
        logger.info("mixer", `Mixer connected after creation: ${mixer.name} at ${mixer.ip}:${mixer.port}`, { action: "connect", details: { mixerId: mixer.id, ip: mixer.ip, port: mixer.port } });
      } else {
        logger.warn("mixer", `Mixer created but failed to connect: ${mixer.name} at ${mixer.ip}:${mixer.port}`, { action: "connect_failed", details: { mixerId: mixer.id, ip: mixer.ip, port: mixer.port } });
      }

      broadcast({ type: "invalidate", keys: ["mixers"] });
      res.json(mixer);
    } catch (error: any) {
      logger.error("mixer", `Failed to create mixer: ${error.message}`, { action: "create_error", details: { error: error.message } });
      res.status(500).json({ message: error.message || "Failed to create mixer" });
    }
  });

  app.patch("/api/mixers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = patchMixerSchema.safeParse(req.body);
      if (!result.success) {
        logger.warn("mixer", `Failed to update mixer ${id}: validation error`, { details: { error: fromError(result.error).toString() } });
        return res.status(400).json({ message: fromError(result.error).toString() });
      }

      const mixer = await storage.updateMixer(id, result.data);
      if (!mixer) {
        logger.warn("mixer", `Mixer ${id} not found for update`, { action: "update_not_found", details: { mixerId: id } });
        return res.status(404).json({ message: "Mixer not found" });
      }

      logger.info("mixer", `Mixer updated: ${mixer.name}`, { action: "update", details: { mixerId: id, updates: result.data } });
      broadcast({ type: "invalidate", keys: ["mixers"] });
      res.json(mixer);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("mixer", `Failed to update mixer: ${message}`, { action: "update_error", details: { error: message } });
      res.status(500).json({ message: "Failed to update mixer" });
    }
  });

  app.delete("/api/mixers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      logger.info("mixer", `Deleting mixer ${id} and disconnecting`, { action: "delete", details: { mixerId: id } });
      x32Manager.disconnect();
      await storage.deleteMixer(id);
      logger.info("mixer", `Mixer ${id} deleted successfully`, { action: "deleted", details: { mixerId: id } });
      broadcast({ type: "invalidate", keys: ["mixers"] });
      res.json({ success: true });
    } catch (error: any) {
      logger.error("mixer", `Failed to delete mixer: ${error.message}`, { action: "delete_error", details: { error: error.message } });
      res.status(500).json({ message: "Failed to delete mixer" });
    }
  });

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

      broadcast({ type: "invalidate", keys: ["mixers"] });
      res.json({ success: connected, status: connected ? "online" : "offline" });
    } catch (error: any) {
      logger.error("mixer", `Connection error: ${error.message}`, { action: "connect_error", details: { error: error.message } });
      res.status(500).json({ message: "Failed to connect to mixer" });
    }
  });

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
}
