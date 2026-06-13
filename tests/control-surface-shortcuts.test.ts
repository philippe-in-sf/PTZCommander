import test from "node:test";
import assert from "node:assert/strict";
import {
  isEditableShortcutTarget,
  resolveControlSurfaceSceneShortcut,
  sceneButtonNumberFromShortcutEvent,
  type ShortcutKeyEventLike,
} from "@shared/control-surface-shortcuts";

type TestSceneButton = {
  id: number;
  buttonNumber: number;
  name: string;
};

function keyEvent(overrides: Partial<ShortcutKeyEventLike> = {}): ShortcutKeyEventLike {
  return {
    key: "1",
    code: "Digit1",
    ctrlKey: true,
    altKey: true,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    ...overrides,
  };
}

function target(overrides: Record<string, unknown>) {
  return {
    tagName: "DIV",
    nodeName: "DIV",
    isContentEditable: false,
    getAttribute: (_name: string) => null,
    closest: (_selector: string) => null,
    ...overrides,
  };
}

test("sceneButtonNumberFromShortcutEvent maps Ctrl+Alt digits to scene numbers", () => {
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "1", code: "Digit1" })), 1);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "9", code: "Digit9" })), 9);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "0", code: "Digit0" })), 10);
});

test("sceneButtonNumberFromShortcutEvent maps numpad digits", () => {
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "7", code: "Numpad7" })), 7);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "Unidentified", code: "Numpad0" })), 10);
});

test("sceneButtonNumberFromShortcutEvent ignores incomplete or unsafe modifiers", () => {
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ ctrlKey: false })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ altKey: false })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ metaKey: true })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ shiftKey: true })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ repeat: true })), null);
  assert.equal(sceneButtonNumberFromShortcutEvent(keyEvent({ key: "A", code: "KeyA" })), null);
});

test("isEditableShortcutTarget detects editable targets", () => {
  assert.equal(isEditableShortcutTarget(target({ tagName: "INPUT", nodeName: "INPUT" })), true);
  assert.equal(isEditableShortcutTarget(target({ tagName: "TEXTAREA", nodeName: "TEXTAREA" })), true);
  assert.equal(isEditableShortcutTarget(target({ tagName: "SELECT", nodeName: "SELECT" })), true);
  assert.equal(isEditableShortcutTarget(target({ isContentEditable: true })), true);
  assert.equal(isEditableShortcutTarget(target({ getAttribute: (name: string) => name === "role" ? "textbox" : null })), true);
  assert.equal(isEditableShortcutTarget(target({ getAttribute: (name: string) => name === "contenteditable" ? "true" : null })), true);
  assert.equal(isEditableShortcutTarget(target({})), false);
});

test("resolveControlSurfaceSceneShortcut ignores editable targets and dialogs", () => {
  const buttons: TestSceneButton[] = [{ id: 2, buttonNumber: 1, name: "Wide" }];

  assert.equal(
    resolveControlSurfaceSceneShortcut(keyEvent({ target: target({ tagName: "INPUT", nodeName: "INPUT" }) }), buttons),
    null,
  );

  assert.equal(
    resolveControlSurfaceSceneShortcut(keyEvent({ target: target({ closest: (selector: string) => selector.includes("dialog") ? {} : null }) }), buttons),
    null,
  );
});

test("resolveControlSurfaceSceneShortcut resolves by buttonNumber instead of array order", () => {
  const buttons: TestSceneButton[] = [
    { id: 20, buttonNumber: 10, name: "Close" },
    { id: 11, buttonNumber: 1, name: "Wide" },
  ];

  const one = resolveControlSurfaceSceneShortcut(keyEvent({ key: "1", code: "Digit1" }), buttons);
  assert.equal(one?.buttonNumber, 1);
  assert.equal(one?.sceneButton?.id, 11);

  const ten = resolveControlSurfaceSceneShortcut(keyEvent({ key: "0", code: "Digit0" }), buttons);
  assert.equal(ten?.buttonNumber, 10);
  assert.equal(ten?.sceneButton?.id, 20);
});

test("resolveControlSurfaceSceneShortcut returns an accepted missing-scene result", () => {
  const result = resolveControlSurfaceSceneShortcut<TestSceneButton>(keyEvent({ key: "5", code: "Digit5" }), []);

  assert.equal(result?.buttonNumber, 5);
  assert.equal(result?.sceneButton, null);
});
