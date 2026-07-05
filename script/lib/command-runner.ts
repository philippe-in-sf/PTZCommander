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
}

export function runCommand(command: string, args: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
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
    child.on("error", reject);
    child.on("close", (code) => {
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
        reject(error);
        return;
      }
      resolve({ code, stdout, stderr });
    });

    if (options.input) child.stdin.end(options.input);
    else child.stdin.end();
  });
}
