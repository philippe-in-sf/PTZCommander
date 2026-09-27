import type { RouteContext } from "./types";
import { logger } from "../logger";
import { APP_VERSION } from "@shared/version";
import { registerApiAccessRule } from "../auth";
import { buildDiagnosticsBundle } from "../diagnostics";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { getRehearsalMode, setRehearsalMode } from "../rehearsal";
import rateLimit from "express-rate-limit";
import {
  DESKTOP_UPDATE_ARCHIVE_NAME,
  buildDesktopUpdateManifest,
  inspectDesktopUpdateArtifact,
} from "../desktop-update";
import { appConfigExportSchema } from "@shared/app-config";

const execFileAsync = promisify(execFile);
const desktopUpdateRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many desktop update requests; wait a minute and try again" },
});

function getVersionMetadata() {
  return {
    version: APP_VERSION,
    workingDirectory: process.cwd(),
    nodeVersion: process.version,
    pid: process.pid,
  };
}

function omitKeys<T extends Record<string, any>>(value: T, keys: string[]) {
  const next = { ...value };
  for (const key of keys) delete next[key];
  return next;
}

function normalizeNullable<T extends Record<string, any>>(value: T, keys: string[]) {
  const next: Record<string, any> = { ...value };
  for (const key of keys) {
    if (next[key] === undefined) next[key] = null;
  }
  return next;
}

async function buildAppConfigExport(storage: RouteContext["storage"]) {
  const cameras = await storage.getAllCameras();
  const presets = (await Promise.all(cameras.map((camera) => storage.getPresetsForCamera(camera.id)))).flat();

  return {
    type: "ptz-command-config" as const,
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      cameras,
      presets,
      mixers: await storage.getAllMixers(),
      switchers: await storage.getAllSwitchers(),
      sceneButtons: await storage.getAllSceneButtons(),
      layouts: await storage.getAllLayouts(),
      macros: await storage.getAllMacros(),
      obsConnections: await storage.getAllObsConnections(),
      runsheetCues: await storage.getAllRunsheetCues(),
      hueBridges: await storage.getAllHueBridges(),
      displayDevices: await storage.getAllDisplayDevices(),
    },
  };
}

async function clearConfig(storage: RouteContext["storage"]) {
  for (const cue of await storage.getAllRunsheetCues()) await storage.deleteRunsheetCue(cue.id);
  for (const layout of await storage.getAllLayouts()) await storage.deleteLayout(layout.id);
  for (const scene of await storage.getAllSceneButtons()) await storage.deleteSceneButton(scene.id);
  for (const macro of await storage.getAllMacros()) await storage.deleteMacro(macro.id);
  for (const camera of await storage.getAllCameras()) await storage.deleteCamera(camera.id);
  for (const mixer of await storage.getAllMixers()) await storage.deleteMixer(mixer.id);
  for (const switcher of await storage.getAllSwitchers()) await storage.deleteSwitcher(switcher.id);
  for (const obs of await storage.getAllObsConnections()) await storage.deleteObsConnection(obs.id);
  for (const bridge of await storage.getAllHueBridges()) await storage.deleteHueBridge(bridge.id);
  for (const display of await storage.getAllDisplayDevices()) await storage.deleteDisplayDevice(display.id);
}

async function importAppConfig(ctx: RouteContext, rawConfig: unknown) {
  const parsed = appConfigExportSchema.parse(rawConfig);
  const { storage, cameraManager, x32Manager, atemManager, obsManager } = ctx;

  cameraManager.disconnectAll();
  x32Manager.disconnect();
  atemManager.disconnect();
  obsManager.disconnect();
  await clearConfig(storage);

  const cameraIdMap = new Map<number, number>();
  const sceneButtonIdMap = new Map<number, number>();
  let activeLayoutId: number | null = null;

  for (const item of parsed.data.cameras) {
    const originalId = Number(item.id);
    const created = await storage.createCamera(normalizeNullable(omitKeys(item, ["id", "createdAt", "status", "tallyState", "isProgramOutput", "isPreviewOutput"]), ["username", "password", "streamUrl", "atemInputId"]) as any);
    if (Number.isFinite(originalId)) cameraIdMap.set(originalId, created.id);
    if (item.isProgramOutput) await storage.setProgramCamera(created.id);
    if (item.isPreviewOutput) await storage.setPreviewCamera(created.id);
  }

  for (const item of parsed.data.presets) {
    const cameraId = cameraIdMap.get(Number(item.cameraId));
    if (!cameraId) continue;
    await storage.savePreset({ ...omitKeys(item, ["id", "createdAt", "updatedAt"]), cameraId } as any);
  }

  for (const item of parsed.data.mixers) await storage.createMixer(omitKeys(item, ["id", "createdAt", "status"]) as any);
  for (const item of parsed.data.switchers) await storage.createSwitcher(omitKeys(item, ["id", "createdAt", "status"]) as any);
  for (const item of parsed.data.macros) await storage.createMacro(omitKeys(item, ["id", "createdAt", "updatedAt"]) as any);
  for (const item of parsed.data.obsConnections) await storage.createObsConnection(omitKeys(item, ["id", "createdAt", "status", "currentProgramScene", "studioMode"]) as any);
  for (const item of parsed.data.hueBridges) await storage.createHueBridge(omitKeys(item, ["id", "createdAt", "status"]) as any);
  for (const item of parsed.data.displayDevices) await storage.createDisplayDevice(omitKeys(item, ["id", "createdAt", "status", "powerState", "volume", "muted", "inputSource", "artModeStatus"]) as any);

  for (const item of parsed.data.sceneButtons) {
    const originalId = Number(item.id);
    const cameraId = item.cameraId === null || item.cameraId === undefined ? null : cameraIdMap.get(Number(item.cameraId)) ?? null;
    const created = await storage.createSceneButton({ ...omitKeys(item, ["id"]), cameraId } as any);
    if (Number.isFinite(originalId)) sceneButtonIdMap.set(originalId, created.id);
  }

  for (const item of parsed.data.runsheetCues) {
    const sceneButtonId = sceneButtonIdMap.get(Number(item.sceneButtonId));
    if (!sceneButtonId) continue;
    await storage.createRunsheetCue({ ...omitKeys(item, ["id", "createdAt", "updatedAt"]), sceneButtonId } as any);
  }

  for (const item of parsed.data.layouts) {
    const created = await storage.createLayout(omitKeys(item, ["id", "createdAt", "updatedAt", "isActive"]) as any);
    if (item.isActive) activeLayoutId = created.id;
  }
  if (activeLayoutId) await storage.setActiveLayout(activeLayoutId);

  return {
    cameras: parsed.data.cameras.length,
    presets: parsed.data.presets.length,
    mixers: parsed.data.mixers.length,
    switchers: parsed.data.switchers.length,
    sceneButtons: parsed.data.sceneButtons.length,
    layouts: parsed.data.layouts.length,
    macros: parsed.data.macros.length,
    obsConnections: parsed.data.obsConnections.length,
    runsheetCues: parsed.data.runsheetCues.length,
    hueBridges: parsed.data.hueBridges.length,
    displayDevices: parsed.data.displayDevices.length,
  };
}

function readCpuTimes() {
  return os.cpus().map((cpu) => {
    const total = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    return { idle: cpu.times.idle, total };
  });
}

async function sampleCpuPercent(sampleMs: number = 200) {
  const start = readCpuTimes();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = readCpuTimes();

  const usageRatios = end.map((cpu, index) => {
    const totalDiff = cpu.total - start[index].total;
    const idleDiff = cpu.idle - start[index].idle;
    if (totalDiff <= 0) return 0;
    return 1 - idleDiff / totalDiff;
  });

  const averageUsage = usageRatios.reduce((sum, value) => sum + value, 0) / Math.max(usageRatios.length, 1);
  return Math.max(0, Math.min(100, averageUsage * 100));
}

function getActiveInterfaceNames() {
  return Object.entries(os.networkInterfaces())
    .filter(([, entries]) => (entries || []).some((entry) => entry && !entry.internal))
    .map(([name]) => name);
}

async function readLinuxNetworkCounters(interfaceNames: string[]) {
  let rxBytes = 0;
  let txBytes = 0;

  await Promise.all(interfaceNames.map(async (name) => {
    try {
      const [rx, tx] = await Promise.all([
        readFile(`/sys/class/net/${name}/statistics/rx_bytes`, "utf-8"),
        readFile(`/sys/class/net/${name}/statistics/tx_bytes`, "utf-8"),
      ]);
      rxBytes += Number.parseInt(rx.trim(), 10) || 0;
      txBytes += Number.parseInt(tx.trim(), 10) || 0;
    } catch {
      // Ignore interfaces that do not expose counters.
    }
  }));

  return { rxBytes, txBytes };
}

async function readDarwinNetworkCounters(interfaceNames: string[]) {
  const { stdout } = await execFileAsync("netstat", ["-ibn"]);
  const lines = stdout.split("\n").filter(Boolean);
  const headerLine = lines.find((line) => line.trim().startsWith("Name"));
  if (!headerLine) {
    return { rxBytes: 0, txBytes: 0 };
  }

  const headers = headerLine.trim().split(/\s+/);
  const nameIndex = headers.indexOf("Name");
  const rxIndex = headers.indexOf("Ibytes");
  const txIndex = headers.indexOf("Obytes");

  if (nameIndex === -1 || rxIndex === -1 || txIndex === -1) {
    return { rxBytes: 0, txBytes: 0 };
  }

  const countersByInterface = new Map<string, { rxBytes: number; txBytes: number }>();

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const name = parts[nameIndex];
    if (!name || !interfaceNames.includes(name)) continue;

    const rxBytes = Number.parseInt(parts[rxIndex] || "0", 10);
    const txBytes = Number.parseInt(parts[txIndex] || "0", 10);
    if (!Number.isFinite(rxBytes) || !Number.isFinite(txBytes)) continue;

    const previous = countersByInterface.get(name);
    countersByInterface.set(name, {
      rxBytes: previous ? Math.max(previous.rxBytes, rxBytes) : rxBytes,
      txBytes: previous ? Math.max(previous.txBytes, txBytes) : txBytes,
    });
  }

  let rxBytes = 0;
  let txBytes = 0;
  for (const counters of countersByInterface.values()) {
    rxBytes += counters.rxBytes;
    txBytes += counters.txBytes;
  }

  return { rxBytes, txBytes };
}

async function readNetworkCounters() {
  const activeInterfaceNames = getActiveInterfaceNames()
    .filter((name) => !name.startsWith("utun") && !name.startsWith("awdl") && !name.startsWith("llw"));

  if (activeInterfaceNames.length === 0) {
    return { rxBytes: 0, txBytes: 0 };
  }

  if (process.platform === "linux") {
    return readLinuxNetworkCounters(activeInterfaceNames);
  }

  if (process.platform === "darwin") {
    return readDarwinNetworkCounters(activeInterfaceNames);
  }

  return { rxBytes: 0, txBytes: 0 };
}

async function sampleNetworkThroughput(sampleMs: number = 1000) {
  const start = await readNetworkCounters();
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const end = await readNetworkCounters();

  const rxBytesPerSecond = Math.max(0, (end.rxBytes - start.rxBytes) / (sampleMs / 1000));
  const txBytesPerSecond = Math.max(0, (end.txBytes - start.txBytes) / (sampleMs / 1000));

  return {
    rxBytesPerSecond,
    txBytesPerSecond,
    rxMbps: (rxBytesPerSecond * 8) / 1_000_000,
    txMbps: (txBytesPerSecond * 8) / 1_000_000,
  };
}

async function getDeviceHealthSnapshot(ctx: Pick<RouteContext, "storage" | "cameraManager" | "x32Manager" | "atemManager">) {
  const cameras = await ctx.storage.getAllCameras();
  const mixers = await ctx.storage.getAllMixers();
  const switchers = await ctx.storage.getAllSwitchers();
  const displays = await ctx.storage.getAllDisplayDevices();

  return {
    cameras: cameras.map((cam) => {
      const client = ctx.cameraManager.getClient(cam.id);
      return {
        type: "camera" as const,
        id: cam.id,
        name: cam.name,
        ip: cam.ip,
        port: cam.port,
        status: client?.isConnected() ? "online" : "offline",
        tallyState: cam.tallyState,
      };
    }),
    mixers: mixers.map((m) => {
      const client = ctx.x32Manager.getClient();
      return {
        type: "mixer" as const,
        id: m.id,
        name: m.name,
        ip: m.ip,
        port: m.port,
        status: client?.isConnected() ? "online" : "offline",
      };
    }),
    switchers: switchers.map((s) => {
      const atemState = ctx.atemManager.getState();
      return {
        type: "switcher" as const,
        id: s.id,
        name: s.name,
        ip: s.ip,
        status: atemState?.connected ? "online" : "offline",
      };
    }),
    displays: displays.map((display) => ({
      type: "display" as const,
      id: display.id,
      name: display.name,
      ip: display.ip,
      status: display.status,
      powerState: display.powerState,
      inputSource: display.inputSource,
    })),
    timestamp: Date.now(),
  };
}

async function getSystemHealthSnapshot() {
  const cpuSampleMs = 200;
  const networkSampleMs = 1000;
  const cpuPercent = await sampleCpuPercent(cpuSampleMs);
  const network = await sampleNetworkThroughput(networkSampleMs);
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
  const processRssBytes = process.memoryUsage().rss;

  return {
    cpuPercent,
    usedMemoryBytes,
    totalMemoryBytes,
    freeMemoryBytes,
    processRssBytes,
    network,
    uptimeSeconds: process.uptime(),
    sampleMs: cpuSampleMs,
    networkSampleMs,
    timestamp: Date.now(),
  };
}

export function registerSystemRoutes(ctx: RouteContext) {
  const { app, storage, broadcast, undoStack, sessionLog, addSessionLog } = ctx;
  registerApiAccessRule(["POST"], /^\/api\/rehearsal$/, "admin");
  registerApiAccessRule(["POST"], /^\/api\/undo$/, "operator");
  registerApiAccessRule(["GET"], /^\/api\/diagnostics\/bundle$/, "operator");
  registerApiAccessRule(["GET"], /^\/api\/config\/export$/, "admin");
  registerApiAccessRule(["POST"], /^\/api\/config\/import$/, "admin");

  app.get("/api/version", (_req, res) => {
    res.json(getVersionMetadata());
  });

  app.get("/api/desktop-update", desktopUpdateRateLimiter, async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await buildDesktopUpdateManifest(APP_VERSION));
    } catch (error: any) {
      logger.error("system", "Failed to inspect the desktop update artifact", {
        action: "desktop_update_manifest_error",
        details: { message: error?.message || String(error) },
      });
      res.status(500).json({ message: "Failed to inspect the desktop update package" });
    }
  });

  app.get("/api/desktop-update/download", desktopUpdateRateLimiter, async (_req, res) => {
    try {
      const artifact = await inspectDesktopUpdateArtifact();
      if (!artifact) {
        return res.status(404).json({ message: "Desktop update package is not available" });
      }
      res.setHeader("Cache-Control", "no-store");
      res.download(artifact.path, DESKTOP_UPDATE_ARCHIVE_NAME);
    } catch (error: any) {
      logger.error("system", "Failed to download the desktop update artifact", {
        action: "desktop_update_download_error",
        details: { message: error?.message || String(error) },
      });
      res.status(500).json({ message: "Failed to download the desktop update package" });
    }
  });

  app.get("/api/rehearsal", (_req, res) => {
    res.json(getRehearsalMode());
  });

  app.post("/api/rehearsal", (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    const previous = getRehearsalMode().enabled;
    const mode = setRehearsalMode(enabled);

    if (previous !== enabled) {
      const action = enabled ? "Rehearsal Enabled" : "Rehearsal Disabled";
      const details = enabled
        ? "ATEM, OBS, and X32 live-output writes are suppressed; VISCA camera moves remain active"
        : "Live-output writes are active";
      addSessionLog("system", action, details);
      logger.warn("system", action, { action: "rehearsal_mode", details: { enabled } });
    }

    broadcast({ type: "rehearsal_mode", enabled });
    broadcast({ type: "invalidate", keys: ["rehearsal"] });
    res.json(mode);
  });

  app.get("/api/mobile/config", (_req, res) => {
    res.json({
      appName: "PTZ Command",
      version: APP_VERSION,
      websocketPath: "/ws",
      features: {
        cameras: true,
        cameraPreview: true,
        presets: true,
        scenes: true,
        macros: true,
        runsheet: true,
        lighting: true,
        displays: true,
        switcher: true,
        mixer: true,
        rehearsal: true,
      },
      endpoints: {
        cameras: "/api/cameras",
        scenes: "/api/scene-buttons",
        macros: "/api/macros",
        runsheet: "/api/runsheet/cues",
        displays: "/api/displays",
        rehearsal: "/api/rehearsal",
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

  app.get("/api/config/export", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store");
      res.json(await buildAppConfigExport(storage));
    } catch (error: any) {
      logger.error("system", "Failed to export configuration", {
        action: "config_export_error",
        details: { message: error?.message || String(error) },
      });
      res.status(500).json({ message: "Failed to export configuration" });
    }
  });

  app.post("/api/config/import", async (req, res) => {
    try {
      const counts = await importAppConfig(ctx, req.body);
      addSessionLog("system", "Configuration Imported", "Station configuration restored from backup");
      logger.warn("system", "Configuration imported from backup", {
        action: "config_import",
        details: counts,
      });
      broadcast({
        type: "invalidate",
        keys: [
          "cameras",
          "presets",
          "mixers",
          "switchers",
          "obs",
          "scene-buttons",
          "layouts",
          "macros",
          "runsheet-cues",
          "hue-bridges",
          "displays",
          "health-devices",
          "live-state",
        ],
      });
      res.json({ success: true, counts });
    } catch (error: any) {
      logger.error("system", "Failed to import configuration", {
        action: "config_import_error",
        details: { message: error?.message || String(error) },
      });
      res.status(400).json({ message: error?.message || "Failed to import configuration" });
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

  app.get("/api/diagnostics/bundle", async (_req, res) => {
    try {
      const bundle = await buildDiagnosticsBundle({
        version: APP_VERSION,
        collectors: {
          system: () => getSystemHealthSnapshot(),
          health: () => getDeviceHealthSnapshot(ctx),
          hueBridges: () => storage.getAllHueBridges(),
          recentLogs: async () => logger.getRecentLogs(50),
          auditLogs: () => storage.getAuditLogs(100),
          sessionLog: async () => [...sessionLog],
        },
      });

      res.json(bundle);
    } catch (error: any) {
      logger.error("system", "Failed to export diagnostics", {
        action: "diagnostics_export",
        details: { message: error?.message || String(error) },
      });
      res.status(500).json({ message: "Failed to export diagnostics" });
    }
  });

  app.get("/api/health/devices", async (_req, res) => {
    try {
      res.json(await getDeviceHealthSnapshot(ctx));
    } catch (error) {
      res.status(500).json({ message: "Failed to get device health" });
    }
  });

  app.get("/api/health/system", async (_req, res) => {
    try {
      res.json(await getSystemHealthSnapshot());
    } catch (error) {
      res.status(500).json({ message: "Failed to get system health" });
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
