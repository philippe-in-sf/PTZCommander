import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("dashboard mixer channel strips keep mute controls in fixed rows", () => {
  const strip = source("client/src/components/mixer/channel-strip.tsx");

  assert.match(strip, /grid-rows-\[24px_128px_14px_28px_16px\]/);
  assert.match(strip, /min-w-16 w-16/);
  assert.match(strip, /line-clamp-2/);
  assert.match(strip, /h-7 w-full p-0/);
});

test("full mixer page channel strips keep mute controls in fixed rows", () => {
  const mixer = source("client/src/pages/mixer.tsx");

  assert.match(mixer, /grid-rows-\[24px_160px_14px_28px_16px\]/);
  assert.match(mixer, /line-clamp-2/);
  assert.match(mixer, /h-7 w-full p-0/);
});
