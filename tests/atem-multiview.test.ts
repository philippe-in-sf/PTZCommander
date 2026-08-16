import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { atemMultiviewVideoStyle, atemTwoPlusEightInputCrop } from "../shared/atem-multiview";

test("ATEM 2+8 multiview crops inputs from the lower four-by-two grid", () => {
  assert.deepEqual(atemTwoPlusEightInputCrop(1), { left: 0, top: 0.5, width: 0.25, height: 0.25 });
  assert.deepEqual(atemTwoPlusEightInputCrop(4), { left: 0.75, top: 0.5, width: 0.25, height: 0.25 });
  assert.deepEqual(atemTwoPlusEightInputCrop(5), { left: 0, top: 0.75, width: 0.25, height: 0.25 });
  assert.deepEqual(atemTwoPlusEightInputCrop(8), { left: 0.75, top: 0.75, width: 0.25, height: 0.25 });
});

test("ATEM multiview crop style scales and offsets the shared video", () => {
  assert.deepEqual(atemMultiviewVideoStyle(atemTwoPlusEightInputCrop(8)), {
    width: "400%",
    height: "400%",
    left: "-300%",
    top: "-300%",
  });
});

test("ATEM multiview rejects unsupported input slots", () => {
  assert.throws(() => atemTwoPlusEightInputCrop(0), /between 1 and 8/);
  assert.throws(() => atemTwoPlusEightInputCrop(9), /between 1 and 8/);
});

test("dashboard mounts the ATEM multiview capture panel", () => {
  const dashboard = readFileSync(join(process.cwd(), "client/src/pages/dashboard.tsx"), "utf8");
  const multiview = readFileSync(join(process.cwd(), "client/src/components/switcher/atem-multiview.tsx"), "utf8");

  assert.match(dashboard, /<AtemMultiview\s*\/>/);
  assert.match(multiview, /Array\.from\(\{ length: 8 \}/);
  assert.match(multiview, /displayInputs\.find\(\(input\) => input\.inputId === inputId\)/);
  assert.match(multiview, /getUserMedia/);
});
