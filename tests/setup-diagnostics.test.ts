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
