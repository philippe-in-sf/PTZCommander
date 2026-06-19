import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readSource(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("capture dialog merge target stays inside the dialog focus boundary", () => {
  const source = readSource("client/src/pages/scenes.tsx");
  const marker = 'data-testid="select-capture-merge-target"';
  const markerIndex = source.indexOf(marker);

  assert.notEqual(markerIndex, -1);

  const mergeTargetControl = source.slice(
    Math.max(0, markerIndex - 800),
    markerIndex + 1_000,
  );

  assert.match(mergeTargetControl, /<select[\s\S]*data-testid="select-capture-merge-target"/);
  assert.match(mergeTargetControl, /id="capture-merge-target"/);
  assert.doesNotMatch(mergeTargetControl, /<SelectContent>|<SelectItem/);
});
