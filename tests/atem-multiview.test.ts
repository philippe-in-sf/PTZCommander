import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM,
  ATEM_MULTIVIEW_LAYOUT_PROGRAM_TOP,
  atemMultiviewVideoStyle,
  atemTwoPlusEightWindowCrop,
} from "../shared/atem-multiview";

test("ATEM Program Bottom layout crops inputs from the upper four-by-two grid", () => {
  assert.deepEqual(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM, 0), { left: 0, top: 0, width: 0.25, height: 0.25 });
  assert.deepEqual(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM, 3), { left: 0.75, top: 0, width: 0.25, height: 0.25 });
  assert.deepEqual(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM, 4), { left: 0, top: 0.25, width: 0.25, height: 0.25 });
  assert.deepEqual(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM, 7), { left: 0.75, top: 0.25, width: 0.25, height: 0.25 });
});

test("ATEM Program Top layout crops inputs from the lower four-by-two grid", () => {
  assert.deepEqual(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_TOP, 0), { left: 0, top: 0.5, width: 0.25, height: 0.25 });
  assert.deepEqual(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_TOP, 7), { left: 0.75, top: 0.75, width: 0.25, height: 0.25 });
});

test("ATEM multiview crop style scales and offsets the shared video", () => {
  assert.deepEqual(atemMultiviewVideoStyle(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM, 7)!), {
    width: "400%",
    height: "400%",
    left: "-300%",
    top: "-100%",
  });
});

test("ATEM multiview rejects unsupported layouts and window slots", () => {
  assert.equal(atemTwoPlusEightWindowCrop(0, 0), null);
  assert.equal(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM, -1), null);
  assert.equal(atemTwoPlusEightWindowCrop(ATEM_MULTIVIEW_LAYOUT_PROGRAM_BOTTOM, 8), null);
});

test("dashboard mounts the ATEM multiview capture panel", () => {
  const dashboard = readFileSync(join(process.cwd(), "client/src/pages/dashboard.tsx"), "utf8");
  const multiview = readFileSync(join(process.cwd(), "client/src/components/switcher/atem-multiview.tsx"), "utf8");

  assert.match(dashboard, /<AtemMultiview\s*\/>/);
  assert.match(multiview, /Array\.from\(\{ length: 8 \}/);
  assert.match(multiview, /displayInputs\.find\(\(input\) => input\.inputId === inputId\)/);
  assert.match(multiview, /getUserMedia/);
});

test("every dashboard skin mounts the ATEM multiview capture panel", () => {
  for (const path of [
    "client/src/pages/dashboard.tsx",
    "client/src/components/skins/broadcast-console.tsx",
    "client/src/components/skins/command-center.tsx",
    "client/src/components/skins/studio-glass.tsx",
  ]) {
    assert.match(readFileSync(join(process.cwd(), path), "utf8"), /<AtemMultiview\s*\/>/);
  }
});
