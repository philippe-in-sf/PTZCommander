import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("uncaught exceptions run bounded cleanup and exit nonzero", () => {
  const directory = mkdtempSync(join(tmpdir(), "ptz-process-"));
  const markerPath = join(directory, "shutdown.txt");
  const result = spawnSync(
    resolve("node_modules/.bin/tsx"),
    [resolve("tests/fixtures/process-crash.ts"), markerPath],
    { encoding: "utf8", timeout: 5_000 },
  );

  assert.equal(result.status, 1, result.stderr);
  assert.equal(readFileSync(markerPath, "utf8"), "shutdown-complete");
  assert.match(result.stderr, /uncaughtException/);
});
