import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("dashboard mixer channel strips use the console fader treatment", () => {
  const channelStrip = source("client/src/components/mixer/channel-strip.tsx");

  assert.match(channelStrip, /mixer-console-strip/);
  assert.match(channelStrip, /mixer-fader-well/);
  assert.match(channelStrip, /mixer-console-slider/);
});

test("dashboard mixer main output uses the console fader treatment", () => {
  const mixerPanel = source("client/src/components/mixer/mixer-panel.tsx");

  assert.match(mixerPanel, /mixer-console-frame/);
  assert.match(mixerPanel, /orientation="vertical"[\s\S]*data-testid="fader-main"/);
  assert.match(mixerPanel, /mixer-console-slider/);
});

test("dashboard mixer panel uses the dark console shell", () => {
  const mixerPanel = source("client/src/components/mixer/mixer-panel.tsx");

  assert.match(mixerPanel, /data-testid="mixer-panel"/);
  assert.match(mixerPanel, /bg-\[#12161a\]/);
  assert.match(mixerPanel, /bg-\[linear-gradient\(#24282c,#0d0f11\)\]/);
  assert.doesNotMatch(mixerPanel, /data-testid="mixer-panel"[\s\S]{0,160}bg-slate-300\/80/);
});
