import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("shared joystick uses high-contrast light-mode styling", () => {
  const joystick = source("client/src/components/ptz/joystick.tsx");

  assert.match(joystick, /bg-slate-100 dark:bg-slate-900/);
  assert.match(joystick, /border-slate-500\/70 dark:border-slate-800/);
  assert.match(joystick, /opacity-45 dark:opacity-20/);
  assert.match(joystick, /bg-white dark:bg-slate-700 border-2 border-slate-500\/70 dark:border-slate-600/);
});
