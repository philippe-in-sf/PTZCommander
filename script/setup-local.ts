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
const nonInteractive = process.argv.includes("--non-interactive");
const assumeYes = process.argv.includes("--yes") && !nonInteractive;
let hasFailure = false;

async function confirm(question: string) {
  if (nonInteractive) return false;
  if (assumeYes) return true;
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
  try {
    const result = await runCommand("lsof", ["-nP", `-iTCP:${portNumber}`, "-sTCP:LISTEN"], { cwd: root });
    if (result.code !== 0 && !result.stdout.trim()) {
      return {
        port: portNumber,
        available: true,
      };
    }
    const owner = parseLsofPortOwner(result.stdout);
    return {
      port: portNumber,
      available: !owner,
      process: owner,
    };
  } catch {
    return {
      port: portNumber,
      available: true,
    };
  }
}

async function main() {
  console.log("PTZ Command local setup");
  console.log("=======================");

  const nodeStatus = classifyNodeVersion(process.version);
  console.log(nodeStatus.ok ? describeNodeProblem(nodeStatus) : `ERROR: ${describeNodeProblem(nodeStatus)}`);
  if (!nodeStatus.ok) {
    hasFailure = true;
    if (process.platform === "darwin" && await commandExists("brew")) {
      const brewList = await runCommand("brew", ["list", "--formula"], { cwd: root });
      console.log(describeHomebrewNodeState(parseHomebrewNodePackages(brewList.stdout), nodeStatus));
    }
    if (!nonInteractive) {
      return;
    }
  }

  const deps = dependencyStatus({
    hasNodeModules: existsSync(join(root, "node_modules")),
    hasTsx: existsSync(join(root, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx")),
  });
  console.log(deps.message);
  if (!deps.ok) {
    if (!nonInteractive) {
      if (await confirm("Run npm install now?")) {
        const install = await runCommand("npm", ["install"], { cwd: root });
        process.stdout.write(install.stdout);
        process.stderr.write(install.stderr);
        if (install.code !== 0) {
          console.error("ERROR: npm install failed.");
          hasFailure = true;
          process.exitCode = install.code || 1;
          return;
        }
      } else {
        hasFailure = true;
        process.exitCode = 1;
        return;
      }
    } else {
      hasFailure = true;
    }
  }

  const ffmpegAvailable = await commandExists("ffmpeg");
  const ffprobeAvailable = await commandExists("ffprobe");
  console.log(ffmpegStatus(ffmpegAvailable && ffprobeAvailable).message);
  if (!ffmpegAvailable || !ffprobeAvailable) {
    console.log(`Missing media binary: ${[
      !ffmpegAvailable ? "ffmpeg" : null,
      !ffprobeAvailable ? "ffprobe" : null,
    ].filter(Boolean).join(", ")}.`);
  }

  const portStatus = await checkPort(port);
  console.log(formatPortConflict(portStatus));
  if (!portStatus.available) {
    console.log(`Use a different port, stop the listed process, or change the launchd PORT before installing. For example: PORT=${port + 1} npm run dev`);
  }

  if (await confirm("Run npm run build now?")) {
    const build = await runCommand("npm", ["run", "build"], { cwd: root });
    process.stdout.write(build.stdout);
    process.stderr.write(build.stderr);
    if (build.code !== 0) {
      console.error("ERROR: npm run build failed.");
      hasFailure = true;
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
        hasFailure = true;
        process.exitCode = launchd.code || 1;
        return;
      }
    }
  }

  console.log("");
  console.log(`Setup check complete. Open http://127.0.0.1:${port}/`);
  if (!ffmpegAvailable || !ffprobeAvailable) {
    console.log("RTSP/RTP preview auto-configuration requires FFmpeg/FFprobe before it can verify streams.");
  } else {
    console.log("Next camera step: npm run cameras:configure-previews");
  }

  if (hasFailure) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
