import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePresetName,
  requiresProgramRecallConfirmation,
} from "@shared/preset-management";

test("requiresProgramRecallConfirmation is true for program tally", () => {
  assert.equal(requiresProgramRecallConfirmation({ tallyState: "program" }), true);
});

test("requiresProgramRecallConfirmation is true for program output flag", () => {
  assert.equal(requiresProgramRecallConfirmation({ isProgramOutput: true }), true);
});

test("requiresProgramRecallConfirmation is false for preview, off, and missing cameras", () => {
  assert.equal(requiresProgramRecallConfirmation({ tallyState: "preview" }), false);
  assert.equal(requiresProgramRecallConfirmation({ tallyState: "off", isProgramOutput: false }), false);
  assert.equal(requiresProgramRecallConfirmation(null), false);
  assert.equal(requiresProgramRecallConfirmation(undefined), false);
});

test("normalizePresetName trims names and converts blank names to null", () => {
  assert.equal(normalizePresetName(" Center Close "), "Center Close");
  assert.equal(normalizePresetName("   "), null);
  assert.equal(normalizePresetName(""), null);
});
