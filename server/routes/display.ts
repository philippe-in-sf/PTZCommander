import type { RouteContext } from "./types";
import { insertDisplayDeviceSchema, patchDisplayDeviceSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import { SmartThingsClient, commandForDisplayAction } from "../smartthings";
import { logger } from "../logger";

const smartThingsDiscoverSchema = z.object({
  token: z.string().min(10),
});

const displayCommandSchema = z.object({
  command: z.enum(["power_on", "power_off", "set_volume", "mute", "unmute", "set_input", "custom"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  capability: z.string().optional(),
  smartthingsCommand: z.string().optional(),
  arguments: z.array(z.unknown()).optional(),
});

export async function executeDisplayAction(ctx: RouteContext, action: z.infer<typeof displayCommandSchema> & { displayId: number }) {
  const display = await ctx.storage.getDisplayDevice(action.displayId);
  if (!display) throw new Error("Display not found");
  if (display.protocol !== "smartthings") throw new Error(`Unsupported display protocol: ${display.protocol}`);
  if (!display.smartthingsToken || !display.smartthingsDeviceId) throw new Error("Display is missing SmartThings credentials");

  const client = new SmartThingsClient(display.smartthingsToken);
  const command = commandForDisplayAction(action);
  await client.sendCommands(display.smartthingsDeviceId, [command]);

  const refreshed = await refreshDisplayStatus(ctx, display.id);
  ctx.addSessionLog("system", "Display", `${display.name}: ${action.command}`);
  logger.info("system", `Display command: ${display.name} ${action.command}`, {
    action: "display:command",
    details: { displayId: display.id, command: action.command },
  });
  return refreshed;
}

async function refreshDisplayStatus(ctx: RouteContext, id: number) {
  const display = await ctx.storage.getDisplayDevice(id);
  if (!display) throw new Error("Display not found");
  if (display.protocol !== "smartthings" || !display.smartthingsToken || !display.smartthingsDeviceId) {
    return display;
  }

  const client = new SmartThingsClient(display.smartthingsToken);
  try {
    const status = await client.getStatus(display.smartthingsDeviceId);
    return await ctx.storage.updateDisplayDevice(id, {
      status: "online",
      powerState: status.powerState,
      volume: typeof status.volume === "number" ? status.volume : null,
      muted: status.muted,
      inputSource: status.inputSource,
    }) || display;
  } catch (error) {
    await ctx.storage.updateDisplayDevice(id, { status: "offline" });
    throw error;
  }
}

export function registerDisplayRoutes(ctx: RouteContext) {
  const { app, storage, broadcast } = ctx;

  app.get("/api/displays", async (_req, res) => {
    try {
      const displays = await storage.getAllDisplayDevices();
      res.json(displays);
    } catch {
      res.status(500).json({ message: "Failed to get displays" });
    }
  });

  app.post("/api/displays/smartthings/discover", async (req, res) => {
    try {
      const parsed = smartThingsDiscoverSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });

      const devices = await new SmartThingsClient(parsed.data.token).listDevices();
      const likelyDisplays = devices.filter((device) =>
        device.capabilities.includes("switch") &&
        (device.capabilities.includes("audioVolume") ||
          device.capabilities.includes("mediaInputSource") ||
          /tv|frame|display/i.test(`${device.name} ${device.label || ""} ${device.manufacturerName || ""}`))
      );
      res.json({ devices: likelyDisplays.length > 0 ? likelyDisplays : devices });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to discover SmartThings devices" });
    }
  });

  app.post("/api/displays", async (req, res) => {
    try {
      const parsed = insertDisplayDeviceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });

      const display = await storage.createDisplayDevice(parsed.data);
      let refreshed = display;
      if (display.smartthingsToken && display.smartthingsDeviceId) {
        try {
          refreshed = await refreshDisplayStatus(ctx, display.id);
        } catch {
          refreshed = await storage.updateDisplayDevice(display.id, { status: "offline" }) || display;
        }
      }
      broadcast({ type: "invalidate", keys: ["displays", "health-devices"] });
      res.status(201).json(refreshed);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create display" });
    }
  });

  app.patch("/api/displays/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const parsed = patchDisplayDeviceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });

      const display = await storage.updateDisplayDevice(id, parsed.data);
      if (!display) return res.status(404).json({ message: "Display not found" });
      broadcast({ type: "invalidate", keys: ["displays", "health-devices"] });
      res.json(display);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to update display" });
    }
  });

  app.delete("/api/displays/:id", async (req, res) => {
    try {
      await storage.deleteDisplayDevice(parseInt(req.params.id));
      broadcast({ type: "invalidate", keys: ["displays", "health-devices"] });
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to delete display" });
    }
  });

  app.post("/api/displays/:id/refresh", async (req, res) => {
    try {
      const display = await refreshDisplayStatus(ctx, parseInt(req.params.id));
      broadcast({ type: "invalidate", keys: ["displays", "health-devices"] });
      res.json(display);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to refresh display" });
    }
  });

  app.post("/api/displays/:id/command", async (req, res) => {
    try {
      const parsed = displayCommandSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });

      const display = await executeDisplayAction(ctx, { ...parsed.data, displayId: parseInt(req.params.id) });
      broadcast({ type: "invalidate", keys: ["displays", "health-devices"] });
      res.json(display);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to control display" });
    }
  });
}
