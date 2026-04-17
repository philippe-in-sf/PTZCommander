import type { RouteContext } from "./types";
import { insertDisplayDeviceSchema, patchDisplayDeviceSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import { SmartThingsClient, commandForDisplayAction } from "../smartthings";
import { discoverSamsungDisplays, keyForSamsungAction, SamsungLocalDisplayClient } from "../samsung-local";
import { logger } from "../logger";
import type { DisplayDevice } from "@shared/schema";

const smartThingsDiscoverSchema = z.object({
  token: z.string().min(10),
});

const samsungDiscoverSchema = z.object({
  timeoutMs: z.number().int().min(500).max(10000).optional(),
});

const DEFAULT_SMARTTHINGS_SCOPE = "r:devices:* x:devices:* r:locations:*";

const smartThingsOAuthStartSchema = z.object({
  clientId: z.string().min(6),
  clientSecret: z.string().min(6),
  redirectUri: z.string().url(),
  scope: z.string().min(3).default(DEFAULT_SMARTTHINGS_SCOPE),
});

const displayCommandSchema = z.object({
  command: z.enum(["power_on", "power_off", "power_toggle", "set_volume", "volume_up", "volume_down", "mute", "unmute", "set_input", "custom"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  capability: z.string().optional(),
  smartthingsCommand: z.string().optional(),
  arguments: z.array(z.unknown()).optional(),
});

const oauthStates = new Map<string, z.infer<typeof smartThingsOAuthStartSchema> & { createdAt: number }>();
const oauthSessions = new Map<string, {
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  scope?: string;
  clientId: string;
  clientSecret: string;
}>();

function redactDisplay(display: DisplayDevice) {
  return {
    ...display,
    smartthingsToken: null,
    smartthingsRefreshToken: null,
    smartthingsClientSecret: null,
    samsungToken: null,
    paired: Boolean(display.samsungToken || display.smartthingsToken || display.smartthingsRefreshToken),
  };
}

async function getSmartThingsClientForDisplay(ctx: RouteContext, display: DisplayDevice) {
  if (!display.smartthingsToken) throw new Error("Display is missing SmartThings access token");
  const expiresAt = display.smartthingsTokenExpiresAt?.getTime();
  const refreshable = display.smartthingsRefreshToken && display.smartthingsClientId && display.smartthingsClientSecret;

  if (refreshable && expiresAt && expiresAt < Date.now() + 5 * 60 * 1000) {
    const refreshed = await SmartThingsClient.refreshAccessToken({
      clientId: display.smartthingsClientId!,
      clientSecret: display.smartthingsClientSecret!,
      refreshToken: display.smartthingsRefreshToken!,
    });
    await ctx.storage.updateDisplayDevice(display.id, {
      smartthingsToken: refreshed.accessToken,
      smartthingsRefreshToken: refreshed.refreshToken || display.smartthingsRefreshToken,
      smartthingsTokenExpiresAt: new Date(refreshed.expiresAt),
    });
    return new SmartThingsClient(refreshed.accessToken);
  }

  return new SmartThingsClient(display.smartthingsToken);
}

export async function executeDisplayAction(ctx: RouteContext, action: z.infer<typeof displayCommandSchema> & { displayId: number }) {
  const display = await ctx.storage.getDisplayDevice(action.displayId);
  if (!display) throw new Error("Display not found");

  if (display.protocol === "smartthings") {
    if (!display.smartthingsToken || !display.smartthingsDeviceId) throw new Error("Display is missing SmartThings credentials");
    const client = await getSmartThingsClientForDisplay(ctx, display);
    const command = action.command === "power_toggle"
      ? {
          capability: "switch",
          command: (await client.getStatus(display.smartthingsDeviceId)).powerState === "on" ? "off" : "on",
        }
      : commandForDisplayAction(action);
    await client.sendCommands(display.smartthingsDeviceId, [command]);
  } else if (display.protocol === "samsung_local") {
    if (!display.ip) throw new Error("Display is missing IP address");
    const key = keyForSamsungAction(action);
    if (!key) throw new Error(`Samsung local control does not support ${action.command}`);
    const client = new SamsungLocalDisplayClient({ ip: display.ip, port: display.samsungPort || 8002, token: display.samsungToken });
    await client.sendKey(key);
  } else {
    throw new Error(`Unsupported display protocol: ${display.protocol}`);
  }

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
  if (display.protocol === "samsung_local") {
    if (!display.ip) return display;
    try {
      const info = await new SamsungLocalDisplayClient({ ip: display.ip, port: display.samsungPort || 8002, token: display.samsungToken }).getInfo();
      return await ctx.storage.updateDisplayDevice(id, {
        status: "online",
        powerState: "on",
        samsungPort: info.port,
        samsungModel: info.modelName || display.samsungModel,
      }) || display;
    } catch (error) {
      await ctx.storage.updateDisplayDevice(id, { status: "offline" });
      throw error;
    }
  }
  if (display.protocol !== "smartthings" || !display.smartthingsToken || !display.smartthingsDeviceId) {
    return display;
  }

  const client = await getSmartThingsClientForDisplay(ctx, display);
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
      res.json(displays.map(redactDisplay));
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

  app.post("/api/displays/samsung/discover", async (req, res) => {
    try {
      const parsed = samsungDiscoverSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });
      const existing = await storage.getAllDisplayDevices();
      const displays = await discoverSamsungDisplays(parsed.data.timeoutMs);
      res.json({
        displays: displays.map((display) => ({
          ...display,
          protocol: "samsung_local",
          alreadyConfigured: existing.some((item) => item.protocol === "samsung_local" && item.ip === display.ip),
        })),
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to discover Samsung TVs" });
    }
  });

  app.post("/api/displays/smartthings/oauth/start", async (req, res) => {
    try {
      const parsed = smartThingsOAuthStartSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });
      const state = crypto.randomUUID();
      oauthStates.set(state, { ...parsed.data, createdAt: Date.now() });
      const authorizeUrl = SmartThingsClient.getAuthorizeUrl({ ...parsed.data, state });
      res.json({ authorizeUrl, state, redirectUri: parsed.data.redirectUri, scope: parsed.data.scope });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to start SmartThings OAuth" });
    }
  });

  app.get("/api/displays/smartthings/oauth/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const pending = oauthStates.get(state);
    if (!code || !state || !pending) {
      return res.status(400).send("SmartThings authorization could not be completed. Return to PTZ Command and try again.");
    }

    try {
      const token = await SmartThingsClient.exchangeCode({
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        redirectUri: pending.redirectUri,
        code,
      });
      oauthStates.delete(state);
      oauthSessions.set(state, {
        ...token,
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
      });
      res.redirect(`/displays?smartthingsAuth=${encodeURIComponent(state)}`);
    } catch (error: any) {
      res.status(500).send(error.message || "SmartThings authorization failed.");
    }
  });

  app.get("/api/displays/smartthings/oauth/session/:state", (req, res) => {
    const session = oauthSessions.get(req.params.state);
    if (!session) return res.status(404).json({ message: "SmartThings authorization session not found" });
    res.json(session);
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
      } else if (display.protocol === "samsung_local" && display.ip) {
        try {
          refreshed = await refreshDisplayStatus(ctx, display.id);
        } catch {
          refreshed = await storage.updateDisplayDevice(display.id, { status: "offline" }) || display;
        }
      }
      broadcast({ type: "invalidate", keys: ["displays", "health-devices"] });
      res.status(201).json(redactDisplay(refreshed));
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
      res.json(redactDisplay(display));
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
      res.json(redactDisplay(display));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to refresh display" });
    }
  });

  app.post("/api/displays/:id/pair", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const display = await storage.getDisplayDevice(id);
      if (!display) return res.status(404).json({ message: "Display not found" });
      if (display.protocol !== "samsung_local") return res.status(400).json({ message: "Pairing is only available for local Samsung displays" });
      if (!display.ip) return res.status(400).json({ message: "Display is missing IP address" });
      const client = new SamsungLocalDisplayClient({ ip: display.ip, port: display.samsungPort || 8002 });
      const token = await client.pair();
      const updated = await storage.updateDisplayDevice(id, { samsungToken: token, status: "online" }) || display;
      broadcast({ type: "invalidate", keys: ["displays", "health-devices"] });
      res.json(redactDisplay(updated));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to pair Samsung TV" });
    }
  });

  app.post("/api/displays/:id/command", async (req, res) => {
    try {
      const parsed = displayCommandSchema.safeParse(req.body || {});
      if (!parsed.success) return res.status(400).json({ message: fromError(parsed.error).toString() });

      const display = await executeDisplayAction(ctx, { ...parsed.data, displayId: parseInt(req.params.id) });
      broadcast({ type: "invalidate", keys: ["displays", "health-devices"] });
      res.json(redactDisplay(display));
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to control display" });
    }
  });
}
