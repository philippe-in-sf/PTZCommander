# Local Setup Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a guided local setup command and camera preview auto-configuration command for PTZ Command technical volunteers/admins.

**Architecture:** Add small, testable helpers under `script/lib/` for runtime diagnostics, command execution, port checks, secrets, SQLite camera access, and FFprobe probing. Add two script entrypoints, `script/setup-local.ts` and `script/configure-camera-previews.ts`, and expose them through `package.json` scripts. Keep production app code unchanged except for reusing compatible data formats.

**Tech Stack:** Node 24, TypeScript via `tsx`, built-in `node:test`, `better-sqlite3`, FFprobe, npm scripts, existing SQLite schema and secret format.

---

## File Structure

- Create: `script/lib/setup-diagnostics.ts`
  - Pure helpers for Node version classification, dependency checks, Homebrew diagnostics, FFmpeg checks, port result formatting, and setup summary formatting.
- Create: `script/lib/command-runner.ts`
  - Thin wrapper around `child_process.spawn` for scripts to run commands with captured output and injectable tests.
- Create: `script/lib/camera-preview-config.ts`
  - Camera row types, preview candidate generation, encrypted password helper, no-overwrite decision, and persistence helpers.
- Create: `script/setup-local.ts`
  - Interactive/local setup entrypoint.
- Create: `script/configure-camera-previews.ts`
  - Interactive camera preview configuration entrypoint.
- Create: `tests/setup-diagnostics.test.ts`
  - Unit tests for setup diagnostics and messages.
- Create: `tests/camera-preview-config.test.ts`
  - Unit tests for preview candidate generation, encryption compatibility, and no-overwrite behavior.
- Modify: `package.json`
  - Add `setup:local` and `cameras:configure-previews` scripts.
- Modify: `README.md`
  - Replace stale setup instructions with the guided command and correct URL.
- Modify: `scripts/setup.sh`
  - Make legacy shell setup delegate to `npm run setup:local` and stop printing port 5000.

## Task 1: Setup Diagnostics Helpers

**Files:**
- Create: `script/lib/setup-diagnostics.ts`
- Test: `tests/setup-diagnostics.test.ts`

- [ ] **Step 1: Write failing tests for Node and dependency diagnostics**

Create `tests/setup-diagnostics.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNodeVersion,
  describeNodeProblem,
  describeHomebrewNodeState,
  dependencyStatus,
  formatPortConflict,
  parseHomebrewNodePackages,
  type PortCheckResult,
} from "../script/lib/setup-diagnostics";

test("classifyNodeVersion accepts Node 24", () => {
  assert.deepEqual(classifyNodeVersion("v24.18.0"), {
    ok: true,
    major: 24,
    version: "v24.18.0",
  });
});

test("classifyNodeVersion rejects Node 26 with useful message", () => {
  const result = classifyNodeVersion("v26.4.0");
  assert.equal(result.ok, false);
  assert.equal(result.major, 26);
  assert.match(describeNodeProblem(result), /requires Node 24\.x/);
  assert.match(describeNodeProblem(result), /Node 26/);
});

test("dependencyStatus reports missing tsx binary", () => {
  const status = dependencyStatus({ hasNodeModules: true, hasTsx: false });
  assert.equal(status.ok, false);
  assert.match(status.message, /Dependencies are not installed/);
  assert.match(status.message, /npm install/);
});

test("formatPortConflict identifies process and port", () => {
  const result: PortCheckResult = {
    port: 3478,
    available: false,
    process: "node 1234",
  };
  assert.equal(formatPortConflict(result), "Port 3478 is already in use by node 1234.");
});

test("describeHomebrewNodeState explains node and node@24 conflict", () => {
  const packages = parseHomebrewNodePackages("node\nnode@24\n");
  const nodeStatus = classifyNodeVersion("v26.4.0");
  assert.match(describeHomebrewNodeState(packages, nodeStatus), /Homebrew has both node and node@24/);
  assert.match(describeHomebrewNodeState(packages, nodeStatus), /brew unlink node/);
  assert.match(describeHomebrewNodeState(packages, nodeStatus), /brew link --overwrite --force node@24/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test -- tests/setup-diagnostics.test.ts
```

Expected: FAIL because `script/lib/setup-diagnostics.ts` does not exist.

- [ ] **Step 3: Implement setup diagnostics helpers**

Create `script/lib/setup-diagnostics.ts`:

```ts
export const REQUIRED_NODE_MAJOR = 24;

export interface NodeVersionStatus {
  ok: boolean;
  major: number | null;
  version: string;
}

export interface DependencyInput {
  hasNodeModules: boolean;
  hasTsx: boolean;
}

export interface CheckStatus {
  ok: boolean;
  message: string;
}

export interface PortCheckResult {
  port: number;
  available: boolean;
  process?: string;
}

export interface HomebrewNodePackages {
  hasNode: boolean;
  hasNode24: boolean;
}

export function classifyNodeVersion(version: string): NodeVersionStatus {
  const clean = version.trim();
  const major = Number.parseInt(clean.replace(/^v/, "").split(".")[0] || "", 10);
  return {
    ok: major === REQUIRED_NODE_MAJOR,
    major: Number.isFinite(major) ? major : null,
    version: clean,
  };
}

export function describeNodeProblem(status: NodeVersionStatus): string {
  if (status.ok) return `Node.js ${status.version} matches required Node ${REQUIRED_NODE_MAJOR}.x.`;
  const actual = status.major === null ? status.version || "unknown" : `Node ${status.major}`;
  return `PTZ Command requires Node ${REQUIRED_NODE_MAJOR}.x. Current runtime is ${actual}. If Homebrew installed both node and node@24, unlink node and link node@24, or set PTZCOMMAND_NODE_BIN to a Node 24 executable.`;
}

export function parseHomebrewNodePackages(output: string): HomebrewNodePackages {
  const packages = new Set(output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  return {
    hasNode: packages.has("node"),
    hasNode24: packages.has("node@24"),
  };
}

export function describeHomebrewNodeState(packages: HomebrewNodePackages, status: NodeVersionStatus) {
  if (status.ok) return "Homebrew Node links do not need changes.";
  if (packages.hasNode && packages.hasNode24) {
    return "Homebrew has both node and node@24 installed, and node is not currently Node 24. Run: brew unlink node && brew link --overwrite --force node@24";
  }
  if (!packages.hasNode24) {
    return "Homebrew node@24 is not installed. Install Node 24 or set PTZCOMMAND_NODE_BIN to an absolute Node 24 executable.";
  }
  return "Homebrew node@24 is installed but not active. Run: brew link --overwrite --force node@24";
}

export function dependencyStatus(input: DependencyInput): CheckStatus {
  if (input.hasNodeModules && input.hasTsx) {
    return { ok: true, message: "Dependencies are installed." };
  }
  return {
    ok: false,
    message: "Dependencies are not installed. Run npm install, or let setup run it now.",
  };
}

export function ffmpegStatus(hasFfprobe: boolean): CheckStatus {
  if (hasFfprobe) return { ok: true, message: "FFmpeg/FFprobe is available for RTSP previews." };
  return {
    ok: false,
    message: "FFmpeg/FFprobe is missing. Install FFmpeg before using RTSP/RTP camera previews.",
  };
}

export function formatPortConflict(result: PortCheckResult): string {
  if (result.available) return `Port ${result.port} is available.`;
  return `Port ${result.port} is already in use${result.process ? ` by ${result.process}` : ""}.`;
}
```

- [ ] **Step 4: Run the diagnostics tests**

Run:

```bash
npm run test -- tests/setup-diagnostics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add script/lib/setup-diagnostics.ts tests/setup-diagnostics.test.ts
git commit -m "Add setup diagnostics helpers"
```

## Task 2: Command Runner and Port Checks

**Files:**
- Create: `script/lib/command-runner.ts`
- Modify: `script/lib/setup-diagnostics.ts`
- Test: `tests/setup-diagnostics.test.ts`

- [ ] **Step 1: Add failing tests for command output parsing**

Modify the import from `../script/lib/setup-diagnostics` in `tests/setup-diagnostics.test.ts` so it includes `parseLsofPortOwner`:

```ts
import {
  classifyNodeVersion,
  describeNodeProblem,
  dependencyStatus,
  formatPortConflict,
  parseLsofPortOwner,
  type PortCheckResult,
} from "../script/lib/setup-diagnostics";
```

Then append these tests to the bottom of the file:

```ts
test("parseLsofPortOwner returns the first command and pid", () => {
  const output = [
    "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
    "node     680 user   40u  IPv4  12345      0t0  TCP *:3478 (LISTEN)",
  ].join("\n");
  assert.equal(parseLsofPortOwner(output), "node 680");
});

test("parseLsofPortOwner returns undefined for no process", () => {
  assert.equal(parseLsofPortOwner(""), undefined);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test -- tests/setup-diagnostics.test.ts
```

Expected: FAIL because `parseLsofPortOwner` does not exist.

- [ ] **Step 3: Implement command runner**

Create `script/lib/command-runner.ts`:

```ts
import { spawn } from "node:child_process";

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));

    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}
```

- [ ] **Step 4: Implement port owner parsing**

Add to `script/lib/setup-diagnostics.ts`:

```ts
export function parseLsofPortOwner(output: string) {
  const line = output
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item && !item.startsWith("COMMAND"));
  if (!line) return undefined;
  const [command, pid] = line.split(/\s+/);
  if (!command || !pid) return undefined;
  return `${command} ${pid}`;
}
```

- [ ] **Step 5: Run diagnostics tests**

Run:

```bash
npm run test -- tests/setup-diagnostics.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add script/lib/command-runner.ts script/lib/setup-diagnostics.ts tests/setup-diagnostics.test.ts
git commit -m "Add setup command runner helpers"
```

## Task 3: Camera Preview Configuration Helpers

**Files:**
- Create: `script/lib/camera-preview-config.ts`
- Test: `tests/camera-preview-config.test.ts`

- [ ] **Step 1: Write failing tests for camera preview helpers**

Create `tests/camera-preview-config.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRtspCandidates,
  decryptSetupSecret,
  encryptSetupSecret,
  shouldOverwritePreview,
  type CameraPreviewRow,
} from "../script/lib/camera-preview-config";

test("buildRtspCandidates prefers FoMaKo main and sub streams", () => {
  assert.deepEqual(buildRtspCandidates("192.168.0.27"), [
    "rtsp://192.168.0.27:554/live/av0",
    "rtsp://192.168.0.27:554/live/av1",
  ]);
});

test("encryptSetupSecret round-trips with decryptSetupSecret", () => {
  const encrypted = encryptSetupSecret("admin", "test-secret");
  assert.notEqual(encrypted, "admin");
  assert.equal(decryptSetupSecret(encrypted, "test-secret"), "admin");
});

test("shouldOverwritePreview protects existing configured previews", () => {
  const camera: CameraPreviewRow = {
    id: 1,
    name: "Camera 1",
    ip: "192.168.0.27",
    username: null,
    password: null,
    preview_type: "rtsp",
    stream_url: "rtsp://192.168.0.27:554/live/av0",
    preview_refresh_ms: 2000,
  };
  assert.equal(shouldOverwritePreview(camera, false), false);
  assert.equal(shouldOverwritePreview(camera, true), true);
});

test("shouldOverwritePreview allows empty preview configuration", () => {
  const camera: CameraPreviewRow = {
    id: 1,
    name: "Camera 1",
    ip: "192.168.0.27",
    username: null,
    password: null,
    preview_type: "none",
    stream_url: null,
    preview_refresh_ms: 2000,
  };
  assert.equal(shouldOverwritePreview(camera, false), true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test -- tests/camera-preview-config.test.ts
```

Expected: FAIL because `script/lib/camera-preview-config.ts` does not exist.

- [ ] **Step 3: Implement camera preview helpers**

Create `script/lib/camera-preview-config.ts`:

```ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SECRET_PREFIX = "enc:v1:";
const DEFAULT_SECRET = "ptzcommand-dev-session-secret";

export interface CameraPreviewRow {
  id: number;
  name: string;
  ip: string;
  username: string | null;
  password: string | null;
  preview_type: string | null;
  stream_url: string | null;
  preview_refresh_ms: number | null;
}

export function buildRtspCandidates(ip: string) {
  return [
    `rtsp://${ip}:554/live/av0`,
    `rtsp://${ip}:554/live/av1`,
  ];
}

function secretKey(material = process.env.SECRET_ENCRYPTION_KEY || process.env.SESSION_SECRET || DEFAULT_SECRET) {
  return createHash("sha256").update(material).digest();
}

export function encryptSetupSecret(value: string | null | undefined, material?: string) {
  if (!value) return value ?? null;
  if (value.startsWith(SECRET_PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(material), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSetupSecret(value: string | null | undefined, material?: string) {
  if (!value) return value ?? null;
  if (!value.startsWith(SECRET_PREFIX)) return value;
  const [ivText, tagText, encryptedText] = value.slice(SECRET_PREFIX.length).split(":");
  if (!ivText || !tagText || !encryptedText) return null;
  const decipher = createDecipheriv("aes-256-gcm", secretKey(material), Buffer.from(ivText, "base64"));
  decipher.setAuthTag(Buffer.from(tagText, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function shouldOverwritePreview(camera: CameraPreviewRow, force: boolean) {
  if (force) return true;
  const type = camera.preview_type || "none";
  const url = camera.stream_url || "";
  return type === "none" || url.trim() === "";
}
```

- [ ] **Step 4: Run camera helper tests**

Run:

```bash
npm run test -- tests/camera-preview-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add script/lib/camera-preview-config.ts tests/camera-preview-config.test.ts
git commit -m "Add camera preview configuration helpers"
```

## Task 4: `setup:local` Command

**Files:**
- Create: `script/setup-local.ts`
- Modify: `package.json`
- Test: existing tests and manual command output

- [ ] **Step 1: Add package script**

Modify `package.json` scripts:

```json
"setup:local": "tsx script/setup-local.ts",
"cameras:configure-previews": "tsx script/configure-camera-previews.ts"
```

Keep the existing scripts unchanged.

- [ ] **Step 2: Create `script/setup-local.ts`**

Create `script/setup-local.ts`:

```ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runCommand } from "./lib/command-runner";
import {
  classifyNodeVersion,
  describeHomebrewNodeState,
  dependencyStatus,
  describeNodeProblem,
  ffmpegStatus,
  formatPortConflict,
  parseHomebrewNodePackages,
  parseLsofPortOwner,
  type PortCheckResult,
} from "./lib/setup-diagnostics";

const root = process.cwd();
const port = Number.parseInt(process.env.PORT || "3478", 10);
const nonInteractive = process.argv.includes("--yes") || process.argv.includes("--non-interactive");

async function confirm(question: string) {
  if (nonInteractive) return process.argv.includes("--yes");
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function commandExists(command: string) {
  const result = await runCommand("sh", ["-lc", `command -v ${command}`], { cwd: root });
  return result.code === 0 && result.stdout.trim().length > 0;
}

async function checkPort(portNumber: number): Promise<PortCheckResult> {
  const result = await runCommand("sh", ["-lc", `lsof -nP -iTCP:${portNumber} -sTCP:LISTEN | sed -n '2p'`], { cwd: root });
  const owner = parseLsofPortOwner(result.stdout);
  return {
    port: portNumber,
    available: !owner,
    process: owner,
  };
}

async function main() {
  console.log("PTZ Command local setup");
  console.log("=======================");

  const nodeStatus = classifyNodeVersion(process.version);
  console.log(nodeStatus.ok ? describeNodeProblem(nodeStatus) : `ERROR: ${describeNodeProblem(nodeStatus)}`);
  if (!nodeStatus.ok) {
    if (process.platform === "darwin" && await commandExists("brew")) {
      const brewList = await runCommand("brew", ["list", "--formula"], { cwd: root });
      console.log(describeHomebrewNodeState(parseHomebrewNodePackages(brewList.stdout), nodeStatus));
    }
    process.exitCode = 1;
    return;
  }

  const deps = dependencyStatus({
    hasNodeModules: existsSync(join(root, "node_modules")),
    hasTsx: existsSync(join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx")),
  });
  console.log(deps.message);
  if (!deps.ok) {
    if (await confirm("Run npm install now?")) {
      const install = await runCommand("npm", ["install"], { cwd: root });
      process.stdout.write(install.stdout);
      process.stderr.write(install.stderr);
      if (install.code !== 0) {
        console.error("ERROR: npm install failed.");
        process.exitCode = install.code || 1;
        return;
      }
    } else {
      process.exitCode = 1;
      return;
    }
  }

  const ffprobeAvailable = await commandExists("ffprobe");
  console.log(ffmpegStatus(ffprobeAvailable).message);

  const portStatus = await checkPort(port);
  console.log(formatPortConflict(portStatus));
  if (!portStatus.available) {
    console.log(`Use PORT=4000 npm run dev, stop the listed process, or change the launchd PORT before installing.`);
  }

  if (await confirm("Run npm run build now?")) {
    const build = await runCommand("npm", ["run", "build"], { cwd: root });
    process.stdout.write(build.stdout);
    process.stderr.write(build.stderr);
    if (build.code !== 0) {
      console.error("ERROR: npm run build failed.");
      process.exitCode = build.code || 1;
      return;
    }
  }

  if (process.platform === "darwin" && existsSync(join(root, "deploy", "install-launchd.sh"))) {
    if (await confirm("Install or update the macOS launchd service?")) {
      const launchd = await runCommand("sh", ["deploy/install-launchd.sh"], { cwd: root });
      process.stdout.write(launchd.stdout);
      process.stderr.write(launchd.stderr);
      if (launchd.code !== 0) {
        console.error("ERROR: launchd install failed.");
        process.exitCode = launchd.code || 1;
        return;
      }
    }
  }

  console.log("");
  console.log(`Setup check complete. Open http://127.0.0.1:${port}/`);
  if (!ffprobeAvailable) {
    console.log("RTSP/RTP preview auto-configuration requires FFmpeg/FFprobe before it can verify streams.");
  } else {
    console.log("Next camera step: npm run cameras:configure-previews");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 3: Run metadata check**

Run:

```bash
npm run lint
```

Expected: PASS. If it fails because package scripts are malformed, fix `package.json`.

- [ ] **Step 4: Run setup command in non-interactive mode**

Run:

```bash
npm run setup:local -- --non-interactive
```

Expected: exits successfully on a healthy Node 24/dependencies environment, prints Node 24 status, dependency status, FFmpeg status, port status, and the `http://127.0.0.1:3478/` URL. If port 3478 is occupied by the running app, this is acceptable as long as it reports the owner clearly.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add package.json script/setup-local.ts
git commit -m "Add guided local setup command"
```

## Task 5: `cameras:configure-previews` Command

**Files:**
- Create: `script/configure-camera-previews.ts`
- Modify: `script/lib/camera-preview-config.ts`
- Test: `tests/camera-preview-config.test.ts`

- [ ] **Step 1: Add failing tests for result formatting**

Modify the import from `../script/lib/camera-preview-config` in `tests/camera-preview-config.test.ts` so it includes `formatCameraPreviewResult`:

```ts
import {
  buildRtspCandidates,
  decryptSetupSecret,
  encryptSetupSecret,
  formatCameraPreviewResult,
  shouldOverwritePreview,
  type CameraPreviewRow,
} from "../script/lib/camera-preview-config";
```

Then append these tests to the bottom of the file:

```ts
test("formatCameraPreviewResult reports configured camera", () => {
  assert.equal(
    formatCameraPreviewResult({ name: "Camera 1", status: "configured", url: "rtsp://192.168.0.27:554/live/av0" }),
    "Camera 1: configured rtsp://192.168.0.27:554/live/av0",
  );
});

test("formatCameraPreviewResult reports manual follow-up", () => {
  assert.equal(
    formatCameraPreviewResult({ name: "Camera 2", status: "needs-credentials" }),
    "Camera 2: RTSP responded but needs credentials",
  );
});
```

- [ ] **Step 2: Run camera helper tests and verify failure**

Run:

```bash
npm run test -- tests/camera-preview-config.test.ts
```

Expected: FAIL because `formatCameraPreviewResult` does not exist.

- [ ] **Step 3: Add result formatting helper**

Append to `script/lib/camera-preview-config.ts`:

```ts
export type CameraPreviewResult =
  | { name: string; status: "configured"; url: string }
  | { name: string; status: "skipped-existing"; url: string }
  | { name: string; status: "needs-credentials" }
  | { name: string; status: "no-stream-found" }
  | { name: string; status: "unreachable" };

export function formatCameraPreviewResult(result: CameraPreviewResult) {
  switch (result.status) {
    case "configured":
      return `${result.name}: configured ${result.url}`;
    case "skipped-existing":
      return `${result.name}: kept existing preview ${result.url}`;
    case "needs-credentials":
      return `${result.name}: RTSP responded but needs credentials`;
    case "no-stream-found":
      return `${result.name}: no supported preview stream found`;
    case "unreachable":
      return `${result.name}: camera unreachable`;
  }
}
```

- [ ] **Step 4: Create `script/configure-camera-previews.ts`**

Create `script/configure-camera-previews.ts`:

```ts
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runCommand } from "./lib/command-runner";
import {
  buildRtspCandidates,
  encryptSetupSecret,
  formatCameraPreviewResult,
  shouldOverwritePreview,
  type CameraPreviewRow,
  type CameraPreviewResult,
} from "./lib/camera-preview-config";

const root = process.cwd();
const force = process.argv.includes("--force");
const yes = process.argv.includes("--yes");
const databasePath = process.env.DATABASE_PATH || join(root, "data", "ptzcommand.db");

async function ask(question: string, fallback = "") {
  if (yes) return fallback;
  const rl = createInterface({ input, output });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function ffprobe(url: string, username: string, password: string) {
  const probeUrl = username ? url.replace("rtsp://", `rtsp://${encodeURIComponent(username)}:${encodeURIComponent(password)}@`) : url;
  const result = await runCommand("ffprobe", [
    "-v", "error",
    "-rtsp_transport", "tcp",
    "-timeout", "3000000",
    "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height",
    "-of", "compact=p=0:nk=1",
    probeUrl,
  ], { cwd: root });
  const text = `${result.stdout}\n${result.stderr}`;
  if (result.code === 0 && result.stdout.trim()) return "ok";
  if (/401|Unauthorized/i.test(text)) return "needs-credentials";
  return "failed";
}

async function main() {
  if (!existsSync(databasePath)) {
    console.error(`ERROR: SQLite database not found at ${databasePath}. Start PTZ Command once or set DATABASE_PATH.`);
    process.exit(1);
  }

  const username = await ask("Shared camera username (blank for none): ", "");
  const password = username ? await ask("Shared camera password: ", "") : "";
  const db = new Database(databasePath);
  const cameras = db.prepare(`
    select id, name, ip, username, password, preview_type, stream_url, preview_refresh_ms
    from cameras
    order by id
  `).all() as CameraPreviewRow[];

  const results: CameraPreviewResult[] = [];
  const update = db.prepare(`
    update cameras
    set username = ?, password = ?, preview_type = 'rtsp', stream_url = ?, preview_refresh_ms = ?
    where id = ?
  `);

  for (const camera of cameras) {
    if (!shouldOverwritePreview(camera, force)) {
      results.push({ name: camera.name, status: "skipped-existing", url: camera.stream_url || "" });
      continue;
    }

    let configured = false;
    let sawAuth = false;
    for (const candidate of buildRtspCandidates(camera.ip)) {
      const status = await ffprobe(candidate, username, password);
      if (status === "ok") {
        update.run(
          username || camera.username || null,
          username ? encryptSetupSecret(password) : camera.password,
          candidate,
          camera.preview_refresh_ms || 2000,
          camera.id,
        );
        results.push({ name: camera.name, status: "configured", url: candidate });
        configured = true;
        break;
      }
      if (status === "needs-credentials") sawAuth = true;
    }

    if (!configured) {
      results.push({ name: camera.name, status: sawAuth ? "needs-credentials" : "no-stream-found" });
    }
  }

  for (const result of results) {
    console.log(formatCameraPreviewResult(result));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
```

- [ ] **Step 5: Run camera helper tests**

Run:

```bash
npm run test -- tests/camera-preview-config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run camera command in non-overwrite mode**

Run:

```bash
npm run cameras:configure-previews -- --yes
```

Expected: existing configured previews are reported as kept; no prompt appears because `--yes` supplies blank credentials.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add script/configure-camera-previews.ts script/lib/camera-preview-config.ts tests/camera-preview-config.test.ts
git commit -m "Add camera preview auto-configuration command"
```

## Task 6: Docs and Legacy Setup Script

**Files:**
- Modify: `README.md`
- Modify: `scripts/setup.sh`
- Test: `npm run lint`

- [ ] **Step 1: Update README setup section**

Modify `README.md` Installation section so the primary path is:

````md
### 1. Run Guided Local Setup

```bash
npm run setup:local
```

The setup command checks Node 24.x, dependencies, FFmpeg/FFprobe, port 3478, the production build, and optional macOS launchd installation. It prints the exact URL to open, usually `http://127.0.0.1:3478/`.

### 2. Configure Camera Previews

After cameras have been added or discovered in the app, run:

```bash
npm run cameras:configure-previews
```

This probes common RTSP preview sources, verifies them with FFprobe, and saves working preview URLs and encrypted credentials.
````

Remove or replace any instruction telling users to open `http://localhost:5000`.

- [ ] **Step 2: Replace legacy setup shell script body**

Modify `scripts/setup.sh`:

```sh
#!/bin/sh
set -eu

echo "PTZ Command setup now runs through the guided local setup command."
echo "This checks Node 24, dependencies, FFmpeg, port 3478, build readiness, and launchd options."
echo ""

npm run setup:local
```

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS and no stale README port/version warnings.

- [ ] **Step 4: Commit Task 6**

Run:

```bash
git add README.md scripts/setup.sh
git commit -m "Document guided local setup flow"
```

## Task 7: Full Verification

**Files:**
- No code changes expected unless verification finds issues.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- tests/setup-diagnostics.test.ts tests/camera-preview-config.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 3: Run project checks**

Run:

```bash
npm run check
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run setup local smoke test**

Run:

```bash
npm run setup:local -- --non-interactive
```

Expected: exits successfully on Node 24 when dependencies are installed. If port 3478 is in use by the current app, it reports the owning process and still prints the correct URL.

- [ ] **Step 5: Run camera preview smoke test**

Run:

```bash
npm run cameras:configure-previews -- --yes
```

Expected: does not overwrite existing configured previews unless `--force` is provided. Prints per-camera result lines.

- [ ] **Step 6: Commit verification fixes if needed**

If any verification issue required code changes, stage the specific files changed by the fix and commit them. For example, if the fix touched the setup script and README, run:

```bash
git add script/setup-local.ts README.md
git commit -m "Fix local setup verification issues"
```

If no changes were needed, do not create an empty commit.
