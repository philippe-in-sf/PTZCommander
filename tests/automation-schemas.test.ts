import test from "node:test";
import assert from "node:assert/strict";
import {
  mixerActionSchema,
  parseMacroSteps,
  parseVersionedActionArray,
  stringifyMacroSteps,
  stringifyVersionedActionArray,
} from "@shared/automation-schemas";

test("automation action parser reads legacy arrays and versioned payloads", () => {
  const legacy = JSON.stringify([{ section: "ch", channel: 1, fader: 0.7 }]);
  const legacyParsed = parseVersionedActionArray(legacy, mixerActionSchema);
  assert.equal(legacyParsed?.[0].section, "ch");

  const versioned = stringifyVersionedActionArray([{ section: "main", channel: 1, muted: true }]);
  const versionedParsed = parseVersionedActionArray(versioned, mixerActionSchema);
  assert.equal(versionedParsed?.[0].muted, true);
});

test("automation action parser rejects malformed action arrays", () => {
  const parsed = parseVersionedActionArray(JSON.stringify([{ section: "ch", channel: 0, fader: 4 }]), mixerActionSchema);

  assert.equal(parsed, null);
});

test("macro step parser reads versioned macro steps", () => {
  const payload = stringifyMacroSteps([
    { type: "recall_preset", cameraId: 1, presetNumber: 2 },
    { type: "delay", duration: 250 },
  ]);
  const parsed = parseMacroSteps(payload);

  assert.equal(parsed?.length, 2);
  assert.equal(parsed?.[0].type, "recall_preset");
});
