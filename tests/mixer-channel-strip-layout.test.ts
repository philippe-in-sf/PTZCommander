import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("dashboard mixer channel strips keep console controls in fixed slots", () => {
  const strip = source("client/src/components/mixer/channel-strip.tsx");

  assert.match(strip, /mixer-console-strip/);
  assert.match(strip, /mixer-fader-well relative flex h-\[170px\] w-9/);
  assert.match(strip, /mixer-console-slider h-\[150px\] w-7/);
  assert.match(strip, /mt-1 h-6 min-h-0 w-full/);
  assert.match(strip, /shortStripName\(displayName, channel\)/);
});

test("full mixer page channel strips keep console controls in fixed slots", () => {
  const mixer = source("client/src/pages/mixer.tsx");

  assert.match(mixer, /mixer-console-strip/);
  assert.match(mixer, /mixer-fader-well relative flex h-\[220px\] w-9/);
  assert.match(mixer, /mixer-console-slider h-\[196px\] w-7/);
  assert.match(mixer, /mt-1 h-6 min-h-0 w-full/);
  assert.match(mixer, /shortStripName\(displayName, channel\)/);
});
