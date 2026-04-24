import type { RouteContext } from "./types";
import { patchSwitcherSchema, insertSwitcherSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { errorDetails, logger } from "../logger";

const ATEM_CONTROL_TIMEOUT_STATUS = "control-timeout";
const ATEM_CONTROL_TIMEOUT_MESSAGE =
  "ATEM control handshake timed out. The switcher may be online, but it did not answer the ATEM control protocol.";

export function registerSwitcherRoutes(ctx: RouteContext) {
  const { app, storage, atemManager, broadcast } = ctx;

  app.get("/api/switchers", async (_req, res) => {
    try {
      const switchers = await storage.getAllSwitchers();
      res.json(switchers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get switchers" });
    }
  });

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

  app.post("/api/switchers", async (req, res) => {
    try {
      const result = insertSwitcherSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const switcher = await storage.createSwitcher(result.data);
      const connected = await atemManager.connect(switcher.ip);
      await storage.updateSwitcherStatus(switcher.id, connected ? "online" : ATEM_CONTROL_TIMEOUT_STATUS);
      broadcast({ type: "invalidate", keys: ["switchers"] });
      res.json(await storage.getSwitcher(switcher.id) || switcher);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create switcher" });
    }
  });

  app.patch("/api/switchers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = patchSwitcherSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const switcher = await storage.updateSwitcher(id, result.data);
      if (!switcher) {
        return res.status(404).json({ message: "Switcher not found" });
      }
      broadcast({ type: "invalidate", keys: ["switchers"] });
      res.json(switcher);
    } catch (error) {
      res.status(500).json({ message: "Failed to update switcher" });
    }
  });

  app.delete("/api/switchers/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      atemManager.disconnect();
      await storage.deleteSwitcher(id);
      broadcast({ type: "invalidate", keys: ["switchers"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete switcher" });
    }
  });

  app.post("/api/switchers/:id/connect", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const switcher = await storage.getSwitcher(id);
      if (!switcher) {
        return res.status(404).json({ message: "Switcher not found" });
      }
      logger.info("switcher", `Manual ATEM connect requested for ${switcher.name}`, {
        action: "atem_connect_requested",
        details: { switcherId: id, name: switcher.name, ip: switcher.ip },
      });
      const connected = await atemManager.connect(switcher.ip);
      const status = connected ? "online" : ATEM_CONTROL_TIMEOUT_STATUS;
      const message = connected ? "Connected to ATEM" : ATEM_CONTROL_TIMEOUT_MESSAGE;
      await storage.updateSwitcherStatus(id, status);
      logger[connected ? "info" : "warn"]("switcher", `Manual ATEM connect ${connected ? "succeeded" : "failed"} for ${switcher.name}`, {
        action: connected ? "atem_connect_succeeded" : "atem_connect_failed",
        details: { switcherId: id, name: switcher.name, ip: switcher.ip, status, message },
      });
      broadcast({ type: "invalidate", keys: ["switchers"] });
      res.json({ success: connected, status, message });
    } catch (error) {
      logger.error("switcher", "Manual ATEM connect route failed", {
        action: "atem_connect_route_error",
        details: errorDetails(error),
      });
      res.status(500).json({ message: "Failed to connect to switcher" });
    }
  });

  app.get("/api/switchers/:id/status", async (req, res) => {
    try {
      res.json(atemManager.getState() || { connected: false });
    } catch (error) {
      res.status(500).json({ message: "Failed to get switcher status" });
    }
  });

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
}
