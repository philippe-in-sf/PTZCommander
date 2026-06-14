# Diagnostic Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only diagnostics export and warning/error summary so operators can capture useful troubleshooting context from the Diagnostics page.

**Architecture:** Put redaction, summary, and bundle assembly in a small server module that can be tested without Express. Reuse the existing device health, system health, recent log, audit log, Hue bridge, and session log data sources from `server/routes/system.ts`, then add a thin route and a client download action.

**Tech Stack:** Express, TypeScript, React 19, TanStack Query, sonner toasts, node:test, existing PTZ Command API patterns.

---

## File Structure

- Create `server/diagnostics.ts`: pure redaction, summary, and bundle assembly helpers.
- Create `tests/diagnostics.test.ts`: focused tests for redaction, summary, partial collection, and client filename formatting.
- Create `client/src/lib/diagnostics-export.ts`: pure filename builder used by the Diagnostics page.
- Modify `server/routes/system.ts`: extract existing health snapshot helpers, add `GET /api/diagnostics/bundle`, and register operator access.
- Modify `client/src/lib/api.ts`: add `diagnosticsApi.exportBundle()`.
- Modify `client/src/pages/diagnostics.tsx`: add Export Diagnostics action, pending state, and warning/error summary cards.
- Modify `shared/version.ts`, `package.json`, `package-lock.json`, `README.md`, and `CHANGELOG.md`: bump to `1.7.8` and document the feature.

Run local checks through the bundled Node runtime in this workspace. For example:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
```

## Task 1: Pure Diagnostics Helpers

**Files:**
- Create: `server/diagnostics.ts`
- Create: `tests/diagnostics.test.ts`

- [ ] **Step 1: Write failing redaction and summary tests**

Create `tests/diagnostics.test.ts` with:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  REDACTED_DIAGNOSTIC_VALUE,
  redactDiagnosticsValue,
  summarizeDiagnostics,
} from "../server/diagnostics";
import { diagnosticsBundleFilename } from "../client/src/lib/diagnostics-export";

test("redactDiagnosticsValue masks sensitive keys recursively", () => {
  const redacted = redactDiagnosticsValue({
    camera: {
      password: "camera-password",
      nested: {
        apiKey: "hue-api-key",
        accessToken: "oauth-access-token",
        refreshToken: "oauth-refresh-token",
      },
    },
    authorization: "Bearer token",
    harmless: "keep-me",
  }) as any;

  assert.equal(redacted.camera.password, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.camera.nested.apiKey, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.camera.nested.accessToken, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.camera.nested.refreshToken, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.authorization, REDACTED_DIAGNOSTIC_VALUE);
  assert.equal(redacted.harmless, "keep-me");
});

test("redactDiagnosticsValue masks URL credentials inside strings", () => {
  const redacted = redactDiagnosticsValue({
    streamUrl: "rtsp://admin:super-secret@192.168.0.22/stream1",
    nestedUrl: "snapshot http://viewer:camera-pass@camera.local/frame.jpg",
  }) as any;

  assert.equal(redacted.streamUrl, "rtsp://redacted:redacted@192.168.0.22/stream1");
  assert.equal(redacted.nestedUrl, "snapshot http://redacted:redacted@camera.local/frame.jpg");
  assert.equal(JSON.stringify(redacted).includes("super-secret"), false);
  assert.equal(JSON.stringify(redacted).includes("camera-pass"), false);
});

test("summarizeDiagnostics counts offline devices, Hue bridges, warnings, and errors", () => {
  const summary = summarizeDiagnostics({
    health: {
      cameras: [{ type: "camera", id: 1, name: "Cam 1", ip: "192.168.0.10", status: "offline" }],
      mixers: [{ type: "mixer", id: 1, name: "X32", ip: "192.168.0.20", status: "online" }],
      switchers: [],
      displays: [{ type: "display", id: 1, name: "Display", ip: "192.168.0.30", status: "offline" }],
      timestamp: 1710000000000,
    },
    hueBridges: [
      { id: 1, name: "Hue 1", ip: "192.168.0.40", status: "online", apiKey: "secret" },
      { id: 2, name: "Hue 2", ip: "192.168.0.41", status: "offline", apiKey: null },
    ],
    recentLogs: [
      { timestamp: "2026-06-13T08:00:00.000Z", level: "info", category: "system", message: "Started" },
      { timestamp: "2026-06-13T08:01:00.000Z", level: "warn", category: "camera", message: "Camera slow" },
      { timestamp: "2026-06-13T08:02:00.000Z", level: "error", category: "switcher", message: "Switcher offline" },
    ],
  });

  assert.equal(summary.offlineDevices, 2);
  assert.equal(summary.offlineHueBridges, 1);
  assert.equal(summary.warnings, 1);
  assert.equal(summary.errors, 1);
  assert.deepEqual(summary.lastProblem, {
    timestamp: "2026-06-13T08:02:00.000Z",
    level: "error",
    category: "switcher",
    message: "Switcher offline",
  });
});

test("diagnosticsBundleFilename includes version and filesystem-safe timestamp", () => {
  assert.equal(
    diagnosticsBundleFilename("1.7.8", "2026-06-13T08:30:00.000Z"),
    "ptz-command-diagnostics-v1.7.8-2026-06-13T08-30-00.json",
  );
});
```

- [ ] **Step 2: Run helper tests and verify RED**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/diagnostics.test.ts
```

Expected: FAIL with import errors for `../server/diagnostics` and `../client/src/lib/diagnostics-export`.

- [ ] **Step 3: Add server and client pure helpers**

Create `server/diagnostics.ts` with:

```ts
export const REDACTED_DIAGNOSTIC_VALUE = "redacted";

export interface DiagnosticsLogEntry {
  timestamp?: string | number | Date;
  level?: string;
  category?: string;
  message?: string;
  details?: unknown;
  action?: string;
  userId?: string;
}

export interface DiagnosticsHealthDevice {
  type: string;
  id: number;
  name: string;
  ip: string;
  port?: number;
  status?: string;
}

export interface DiagnosticsHealthSnapshot {
  cameras: DiagnosticsHealthDevice[];
  mixers: DiagnosticsHealthDevice[];
  switchers: DiagnosticsHealthDevice[];
  displays: DiagnosticsHealthDevice[];
  timestamp: number;
}

export interface DiagnosticsHueBridge {
  id: number;
  name: string;
  ip: string;
  status?: string;
  apiKey?: string | null;
}

export interface DiagnosticsSummaryInput {
  health?: DiagnosticsHealthSnapshot | null;
  hueBridges?: DiagnosticsHueBridge[] | null;
  recentLogs?: DiagnosticsLogEntry[] | null;
}

export interface DiagnosticsSummary {
  offlineDevices: number;
  offlineHueBridges: number;
  warnings: number;
  errors: number;
  lastProblem: null | {
    timestamp?: string | number | Date;
    level?: string;
    category?: string;
    message?: string;
  };
}

const SENSITIVE_KEY_PATTERN = /^(password|apikey|api_key|token|secret|access_token|accessToken|refresh_token|refreshToken|authorization)$/i;
const URL_CREDENTIAL_PATTERN = /([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+):([^@/\s]+)@/gi;

function redactUrlCredentials(value: string) {
  return value.replace(URL_CREDENTIAL_PATTERN, "$1redacted:redacted@");
}

export function redactDiagnosticsValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactUrlCredentials(value);
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticsValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      output[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED_DIAGNOSTIC_VALUE
        : redactDiagnosticsValue(nestedValue, seen);
    }
    return output;
  }
  return String(value);
}

function allHealthDevices(health?: DiagnosticsHealthSnapshot | null) {
  return [
    ...(health?.cameras ?? []),
    ...(health?.mixers ?? []),
    ...(health?.switchers ?? []),
    ...(health?.displays ?? []),
  ];
}

function isWarningLog(log: DiagnosticsLogEntry) {
  return String(log.level ?? "").toLowerCase() === "warn";
}

function isErrorLog(log: DiagnosticsLogEntry) {
  return String(log.level ?? "").toLowerCase() === "error";
}

export function summarizeDiagnostics(input: DiagnosticsSummaryInput): DiagnosticsSummary {
  const recentLogs = input.recentLogs ?? [];
  const problemLogs = recentLogs.filter((log) => isWarningLog(log) || isErrorLog(log));
  const lastProblem = problemLogs.length > 0 ? problemLogs[problemLogs.length - 1] : null;

  return {
    offlineDevices: allHealthDevices(input.health).filter((device) => device.status !== "online").length,
    offlineHueBridges: (input.hueBridges ?? []).filter((bridge) => bridge.status !== "online").length,
    warnings: recentLogs.filter(isWarningLog).length,
    errors: recentLogs.filter(isErrorLog).length,
    lastProblem: lastProblem
      ? {
          timestamp: lastProblem.timestamp,
          level: lastProblem.level,
          category: lastProblem.category,
          message: lastProblem.message,
        }
      : null,
  };
}
```

Create `client/src/lib/diagnostics-export.ts` with:

```ts
export function diagnosticsBundleFilename(version: string, generatedAt: string) {
  const safeTimestamp = generatedAt.replace(/\.\d{3}Z$/, "").replace(/:/g, "-");
  return `ptz-command-diagnostics-v${version}-${safeTimestamp}.json`;
}
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/diagnostics.test.ts
```

Expected: PASS for redaction, summary, and filename tests.

- [ ] **Step 5: Commit pure helper work**

Run:

```bash
git add server/diagnostics.ts client/src/lib/diagnostics-export.ts tests/diagnostics.test.ts
git commit -m "feat: add diagnostic bundle helpers"
```

## Task 2: Diagnostic Bundle Assembly and Route

**Files:**
- Modify: `server/diagnostics.ts`
- Modify: `server/routes/system.ts`
- Modify: `tests/diagnostics.test.ts`

- [ ] **Step 1: Add failing partial collection test**

Append to `tests/diagnostics.test.ts`:

```ts
import { buildDiagnosticsBundle } from "../server/diagnostics";

test("buildDiagnosticsBundle preserves partial data and records collection errors", async () => {
  const bundle = await buildDiagnosticsBundle({
    version: "1.7.8",
    now: new Date("2026-06-13T08:30:00.000Z"),
    runtime: {
      nodeVersion: "v20.19.0",
      platform: "darwin",
      arch: "arm64",
      pid: 1234,
      uptimeSeconds: 42,
      workingDirectory: "/workspace",
    },
    collectors: {
      system: async () => ({ cpuPercent: 12 }),
      health: async () => ({
        cameras: [{ type: "camera", id: 1, name: "Cam 1", ip: "192.168.0.10", status: "offline" }],
        mixers: [],
        switchers: [],
        displays: [],
        timestamp: 1710000000000,
      }),
      hueBridges: async () => [{ id: 1, name: "Hue", ip: "192.168.0.20", status: "online", apiKey: "hue-secret" }],
      recentLogs: async () => [{ level: "error", category: "system", message: "Bad thing" }],
      auditLogs: async () => {
        throw new Error("audit unavailable");
      },
      sessionLog: async () => [{ id: 1, timestamp: 1710000000000, category: "system", action: "Started", details: "ok" }],
    },
  });

  assert.equal(bundle.version, "1.7.8");
  assert.equal(bundle.generatedAt, "2026-06-13T08:30:00.000Z");
  assert.equal((bundle.system as any).cpuPercent, 12);
  assert.equal(bundle.auditLogs.length, 0);
  assert.deepEqual(bundle.collectionErrors, [{ section: "auditLogs", message: "audit unavailable" }]);
  assert.equal(bundle.summary.offlineDevices, 1);
  assert.equal(bundle.summary.errors, 1);
  assert.equal((bundle.hueBridges[0] as any).apiKey, REDACTED_DIAGNOSTIC_VALUE);
});
```

- [ ] **Step 2: Run diagnostics tests and verify RED**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/diagnostics.test.ts
```

Expected: FAIL with `buildDiagnosticsBundle` not exported.

- [ ] **Step 3: Add bundle assembly to `server/diagnostics.ts`**

Append this code to `server/diagnostics.ts`:

```ts
export interface DiagnosticsRuntime {
  nodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  pid: number;
  uptimeSeconds: number;
  workingDirectory: string;
}

export interface DiagnosticsCollectionError {
  section: string;
  message: string;
}

export interface DiagnosticsCollectors {
  system: () => Promise<unknown>;
  health: () => Promise<DiagnosticsHealthSnapshot>;
  hueBridges: () => Promise<DiagnosticsHueBridge[]>;
  recentLogs: () => Promise<DiagnosticsLogEntry[]>;
  auditLogs: () => Promise<unknown[]>;
  sessionLog: () => Promise<unknown[]>;
}

export interface BuildDiagnosticsBundleOptions {
  version: string;
  now?: Date;
  runtime?: DiagnosticsRuntime;
  collectors: DiagnosticsCollectors;
}

export interface DiagnosticsBundle {
  generatedAt: string;
  version: string;
  runtime: DiagnosticsRuntime;
  system: unknown;
  health: DiagnosticsHealthSnapshot | null;
  hueBridges: DiagnosticsHueBridge[];
  recentLogs: DiagnosticsLogEntry[];
  auditLogs: unknown[];
  sessionLog: unknown[];
  summary: DiagnosticsSummary;
  collectionErrors: DiagnosticsCollectionError[];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function currentRuntime(): DiagnosticsRuntime {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
    uptimeSeconds: process.uptime(),
    workingDirectory: process.cwd(),
  };
}

async function collectSection<T>(
  section: string,
  fallback: T,
  errors: DiagnosticsCollectionError[],
  collector: () => Promise<T>,
) {
  try {
    return await collector();
  } catch (error) {
    errors.push({ section, message: errorMessage(error) });
    return fallback;
  }
}

export async function buildDiagnosticsBundle(options: BuildDiagnosticsBundleOptions): Promise<DiagnosticsBundle> {
  const collectionErrors: DiagnosticsCollectionError[] = [];
  const [system, health, hueBridges, recentLogs, auditLogs, sessionLog] = await Promise.all([
    collectSection("system", null, collectionErrors, options.collectors.system),
    collectSection<DiagnosticsHealthSnapshot | null>("health", null, collectionErrors, options.collectors.health),
    collectSection<DiagnosticsHueBridge[]>("hueBridges", [], collectionErrors, options.collectors.hueBridges),
    collectSection<DiagnosticsLogEntry[]>("recentLogs", [], collectionErrors, options.collectors.recentLogs),
    collectSection<unknown[]>("auditLogs", [], collectionErrors, options.collectors.auditLogs),
    collectSection<unknown[]>("sessionLog", [], collectionErrors, options.collectors.sessionLog),
  ]);

  const bundle: DiagnosticsBundle = {
    generatedAt: (options.now ?? new Date()).toISOString(),
    version: options.version,
    runtime: options.runtime ?? currentRuntime(),
    system,
    health,
    hueBridges,
    recentLogs,
    auditLogs,
    sessionLog,
    summary: summarizeDiagnostics({ health, hueBridges, recentLogs }),
    collectionErrors,
  };

  return redactDiagnosticsValue(bundle) as DiagnosticsBundle;
}
```

- [ ] **Step 4: Run diagnostics tests and verify GREEN**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/diagnostics.test.ts
```

Expected: PASS for helper and bundle tests.

- [ ] **Step 5: Extract health snapshot helpers in `server/routes/system.ts`**

Move the existing `/api/health/devices` and `/api/health/system` body logic into file-local helpers above `registerSystemRoutes`:

```ts
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
```

Then change the two existing health routes to:

```ts
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
```

- [ ] **Step 6: Add diagnostics route and access rule**

At the top of `server/routes/system.ts`, add:

```ts
import { buildDiagnosticsBundle } from "../diagnostics";
```

Inside `registerSystemRoutes`, add the access rule:

```ts
  registerApiAccessRule(["GET"], /^\/api\/diagnostics\/bundle$/, "operator");
```

Add the route before `/api/health/devices`:

```ts
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
```

- [ ] **Step 7: Run checks for server work**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npx tsx --test tests/diagnostics.test.ts
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: diagnostics tests PASS and TypeScript check PASS.

- [ ] **Step 8: Commit bundle route work**

Run:

```bash
git add server/diagnostics.ts server/routes/system.ts tests/diagnostics.test.ts
git commit -m "feat: add diagnostic bundle API"
```

## Task 3: Diagnostics Page Export and Summary

**Files:**
- Modify: `client/src/lib/api.ts`
- Modify: `client/src/pages/diagnostics.tsx`

- [ ] **Step 1: Add client API method**

In `client/src/lib/api.ts`, add this export near `healthApi`:

```ts
export const diagnosticsApi = {
  exportBundle: async (): Promise<any> => {
    const res = await fetch(`${API_BASE}/diagnostics/bundle`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || "Failed to export diagnostics");
    return data;
  },
};
```

- [ ] **Step 2: Add Diagnostics page imports**

In `client/src/pages/diagnostics.tsx`, change imports to include `Download`, `Loader2`, `ShieldAlert`, and `toast`, and use the new API helpers:

```ts
import { Activity, AlertTriangle, CheckCircle2, Database, Download, Gauge, Lightbulb, Loader2, Monitor, RefreshCw, Server, ShieldAlert, Video, Volume2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { diagnosticsApi, healthApi } from "@/lib/api";
import { diagnosticsBundleFilename } from "@/lib/diagnostics-export";
```

- [ ] **Step 3: Add summary and export state**

Inside `DiagnosticsPage`, after `offlineDeviceCount`, add:

```ts
  const recentLogs = logsQuery.data || [];
  const problemLogs = recentLogs.filter((log) => log.level === "warn" || log.level === "error");
  const warningCount = recentLogs.filter((log) => log.level === "warn").length;
  const errorCount = recentLogs.filter((log) => log.level === "error").length;
  const lastProblem = problemLogs.length > 0 ? problemLogs[problemLogs.length - 1] : null;
  const [isExporting, setIsExporting] = useState(false);
```

Also add `useState` to the React import:

```ts
import { useState, type ReactNode } from "react";
```

- [ ] **Step 4: Add download handler**

Inside `DiagnosticsPage`, below `refreshAll`, add:

```ts
  const exportDiagnostics = async () => {
    setIsExporting(true);
    try {
      const bundle = await diagnosticsApi.exportBundle();
      const filename = diagnosticsBundleFilename(bundle.version || "unknown", bundle.generatedAt || new Date().toISOString());
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Diagnostics exported");
    } catch (error) {
      toast.error("Failed to export diagnostics");
    } finally {
      setIsExporting(false);
    }
  };
```

- [ ] **Step 5: Add Export button beside Refresh**

Replace the single Refresh button container with:

```tsx
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={exportDiagnostics} disabled={isExporting}>
              {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Export Diagnostics
            </Button>
            <Button variant="outline" onClick={refreshAll} disabled={healthQuery.isFetching || hueQuery.isFetching || logsQuery.isFetching || systemQuery.isFetching}>
              <RefreshCw className={cn("w-4 h-4 mr-2", (healthQuery.isFetching || hueQuery.isFetching || logsQuery.isFetching || systemQuery.isFetching) && "animate-spin")} />
              Refresh
            </Button>
          </div>
```

- [ ] **Step 6: Add warning/error summary cards**

Replace the existing three-card summary grid with:

```tsx
        <div className="grid gap-3 md:grid-cols-5">
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-4">
            <p className="text-xs uppercase font-mono text-slate-500 dark:text-slate-400">Hardware Offline</p>
            <p className="text-3xl font-bold mt-2">{offlineDeviceCount}</p>
          </div>
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-4">
            <p className="text-xs uppercase font-mono text-slate-500 dark:text-slate-400">Hue Bridges</p>
            <p className="text-3xl font-bold mt-2">{bridgeCount}</p>
          </div>
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-4">
            <p className="text-xs uppercase font-mono text-slate-500 dark:text-slate-400">Hue Offline</p>
            <p className="text-3xl font-bold mt-2">{offlineBridgeCount}</p>
          </div>
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-4">
            <p className="text-xs uppercase font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2"><ShieldAlert className="w-3.5 h-3.5" /> Warnings / Errors</p>
            <p className="text-3xl font-bold mt-2">{logsQuery.isError ? "--" : `${warningCount}/${errorCount}`}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">warn / error</p>
          </div>
          <div className="border border-slate-300 dark:border-slate-800 rounded-lg p-4 min-w-0">
            <p className="text-xs uppercase font-mono text-slate-500 dark:text-slate-400">Last Problem</p>
            <p className="text-sm font-semibold mt-2 truncate">{logsQuery.isError ? "--" : lastProblem?.message || "None"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{lastProblem ? `${lastProblem.category || "system"} / ${lastProblem.level || "info"}` : "No warning or error events"}</p>
          </div>
        </div>
```

- [ ] **Step 7: Run TypeScript check**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
```

Expected: PASS.

- [ ] **Step 8: Commit client diagnostics work**

Run:

```bash
git add client/src/lib/api.ts client/src/lib/diagnostics-export.ts client/src/pages/diagnostics.tsx tests/diagnostics.test.ts
git commit -m "feat: add diagnostics export UI"
```

## Task 4: Version, Docs, and Verification

**Files:**
- Modify: `shared/version.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Bump app version to 1.7.8**

Change `shared/version.ts` to:

```ts
export const APP_VERSION = "1.7.8";
```

Change `package.json` version to:

```json
"version": "1.7.8"
```

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm install --package-lock-only --ignore-scripts
```

Expected: `package-lock.json` updates its package version to `1.7.8`.

- [ ] **Step 2: Update README**

Change `README.md` current version to:

```md
Current version: **1.7.8**
```

Add this feature bullet in the features list:

```md
- Diagnostics export with redacted support bundles, warning/error summary, and device/Hue health context
```

- [ ] **Step 3: Update changelog**

Add this entry above `1.7.7` in `CHANGELOG.md`:

```md
## [1.7.8] - 2026-06-13

### Added
- **Diagnostic Bundle Export** - added a redacted diagnostics JSON export plus Diagnostics page warning/error summary for faster troubleshooting.

### Changed
- **Version Display** - interface version labels now report v1.7.8
```

- [ ] **Step 4: Run full verification**

Run:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run test
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run check
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH npm run build
```

Expected: tests PASS, TypeScript check PASS, production build PASS. The existing Vite chunk-size warning is acceptable if it remains the only warning.

- [ ] **Step 5: Browser smoke Diagnostics**

Start the local app:

```bash
TMPDIR=/private/tmp PATH=/Users/philippe/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH PORT=4789 npm run dev
```

Open `http://localhost:4789/diagnostics` in the in-app browser. Confirm:

- The Diagnostics page still renders.
- Export Diagnostics button appears beside Refresh.
- Warning/error summary cards fit at desktop and mobile widths.
- If signed in, clicking Export Diagnostics downloads a JSON file and the JSON contains no obvious password, API key, token, or URL credential values.
- If signed out, report the signed-out behavior and rely on automated checks for the authenticated export route.

- [ ] **Step 6: Commit version and docs**

Run:

```bash
git add shared/version.ts package.json package-lock.json README.md CHANGELOG.md
git commit -m "docs: release diagnostic bundle export"
```

## Self-Review

Spec coverage:

- Export Diagnostics button: Task 3.
- Redacted JSON bundle: Tasks 1 and 2.
- Warnings/errors summary: Tasks 1 and 3.
- Client-side download: Task 3.
- Read-only behavior: Task 2 route only reads existing sources.
- Operator access: Task 2 access rule.
- Partial collection errors: Task 2.
- Tests: Tasks 1 and 2.
- Docs and version bump: Task 4.

Marker scan:

- No unresolved marker words or generic fill-in tokens are used.
- The `??` tokens in code snippets are TypeScript nullish coalescing operators, not open questions.
- Code snippets name concrete files, functions, routes, and commands.

Type consistency:

- `summarizeDiagnostics`, `redactDiagnosticsValue`, `buildDiagnosticsBundle`, and `diagnosticsBundleFilename` names match across tests, implementation snippets, and client usage.
- The route returns the same `DiagnosticsBundle` fields described in the approved spec.
