import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyNodeVersion,
  describeNodeProblem,
  describeHomebrewNodeState,
  dependencyStatus,
  formatPortConflict,
  parseHomebrewNodePackages,
  parseLsofPortOwner,
  type PortCheckResult,
} from "../script/lib/setup-diagnostics";
import { runCommand } from "../script/lib/command-runner";

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

test("parseLsofPortOwner skips warning lines before a valid row", () => {
  const output = [
    "lsof: WARNING: can't stat() fs /private/tmp",
    "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
    "node     680 user   40u  IPv4  12345      0t0  TCP *:3478 (LISTEN)",
  ].join("\n");
  assert.equal(parseLsofPortOwner(output), "node 680");
});

test("parseLsofPortOwner ignores rows with a nonnumeric pid", () => {
  const output = [
    "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME",
    "node     PID user   40u  IPv4  12345      0t0  TCP *:3478 (LISTEN)",
  ].join("\n");
  assert.equal(parseLsofPortOwner(output), undefined);
});

test("runCommand merges env overrides and rejects on nonzero exit when requested", async () => {
  await assert.rejects(
    runCommand(
      "node",
      [
        "-e",
        [
          "console.log(process.env.RUN_COMMAND_BASE)",
          "console.log(process.env.RUN_COMMAND_OVERRIDE)",
          "process.exit(3)",
        ].join(";"),
      ],
      {
        env: {
          RUN_COMMAND_BASE: "base",
          RUN_COMMAND_OVERRIDE: "override",
        },
        rejectOnNonZero: true,
      }
    ),
    (error: unknown) => {
      const err = error as Error & {
        code?: number;
        stdout?: string;
        stderr?: string;
        command?: string;
        args?: string[];
      };
      assert.equal(err.message, "Command failed with exit code 3: node -e console.log(process.env.RUN_COMMAND_BASE);console.log(process.env.RUN_COMMAND_OVERRIDE);process.exit(3)");
      assert.equal(err.code, 3);
      assert.match(err.stdout || "", /base/);
      assert.match(err.stdout || "", /override/);
      assert.equal(err.command, "node");
      assert.deepEqual(err.args, [
        "-e",
        "console.log(process.env.RUN_COMMAND_BASE);console.log(process.env.RUN_COMMAND_OVERRIDE);process.exit(3)",
      ]);
      return true;
    }
  );
});
