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
  rejectOnNonZero?: boolean;
  timeoutMs?: number;
  timeoutKillGraceMs?: number;
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    let killTimeout: NodeJS.Timeout | undefined;
    let timedOut = false;
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
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
    function finish(callback: () => void) {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (killTimeout) clearTimeout(killTimeout);
      callback();
    }

    child.on("error", (error) => {
      finish(() => reject(error));
    });
    child.on("close", (code) => {
      if (settled) return;
      if (timedOut) {
        finish(() => resolve({
          code: null,
          stdout,
          stderr: `${stderr}${stderr.endsWith("\n") || stderr === "" ? "" : "\n"}Command timed out after ${options.timeoutMs}ms.`,
        }));
        return;
      }
      if (options.rejectOnNonZero && code && code !== 0) {
        const error = new Error(`Command failed with exit code ${code}: ${command} ${args.join(" ")}`) as Error & {
          code?: number | null;
          stdout?: string;
          stderr?: string;
          command?: string;
          args?: string[];
        };
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        error.command = command;
        error.args = args;
        finish(() => reject(error));
        return;
      }
      finish(() => resolve({ code, stdout, stderr }));
    });

    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        killTimeout = setTimeout(() => {
          if (!settled) child.kill("SIGKILL");
        }, options.timeoutKillGraceMs ?? 1000);
      }, options.timeoutMs);
    }

    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}
