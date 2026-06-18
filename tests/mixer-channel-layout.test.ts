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

test("dashboard mixer channel strips use fixed geometry with bottom-anchored channel numbers", () => {
  const strip = source("client/src/components/mixer/channel-strip.tsx");
  const panel = source("client/src/components/mixer/mixer-panel.tsx");

  assertContainsTokens(strip, ["h-64", "w-20", "shrink-0", "mt-auto"]);
  assert.match(panel, /className="flex items-end gap-1 overflow-x-auto pb-2"/);
});

test("full mixer page keeps wrapped channel strips bottom-aligned", () => {
  const mixerPage = source("client/src/pages/mixer.tsx");

  assertContainsTokens(mixerPage, ["h-80", "w-[72px]", "shrink-0", "mt-auto"]);
  assert.match(mixerPage, /className="flex flex-wrap items-end justify-center gap-2"/);
});
