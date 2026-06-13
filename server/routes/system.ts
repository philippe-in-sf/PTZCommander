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

const execFileAsync = promisify(execFile);

function getVersionMetadata() {
  return {
    version: APP_VERSION,
    workingDirectory: process.cwd(),
    nodeVersion: process.version,
    pid: process.pid,
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

  app.get("/api/version", (_req, res) => {
    res.json(getVersionMetadata());
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
