import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function assertContainsTokens(sourceText: string, tokens: string[]) {
  for (const token of tokens) {
    assert.ok(sourceText.includes(token), `Expected source to include ${token}`);
  }
}

test("dashboard mixer channel strips use the console frame geometry", () => {
  const strip = source("client/src/components/mixer/channel-strip.tsx");
  const panel = source("client/src/components/mixer/mixer-panel.tsx");

  assertContainsTokens(strip, ["mixer-console-strip", "mixer-fader-well", "mixer-console-slider", "min-w-[52px]"]);
  assert.match(panel, /className="mixer-console-frame flex items-stretch gap-1 overflow-x-auto overflow-y-hidden/);
});

test("full mixer page keeps channel strips in the console frame", () => {
  const mixerPage = source("client/src/pages/mixer.tsx");

  assertContainsTokens(mixerPage, ["mixer-console-strip", "mixer-fader-well", "mixer-console-slider", "min-w-[52px]"]);
  assert.match(mixerPage, /className="flex h-full min-h-\[420px\] items-stretch gap-\[3px\]"/);
});

test("full mixer page keeps section tabs above a single console fader frame", () => {
  const mixerPage = source("client/src/pages/mixer.tsx");

  assert.match(mixerPage, /data-testid=\{`tab-section-\$\{tab\.key\}`\}/);
  assert.doesNotMatch(mixerPage, /flex flex-wrap items-end justify-center gap-2/);
});
