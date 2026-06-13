export type ShortcutKeyEventLike = {
  key?: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  target?: unknown;
};

type ShortcutTargetLike = {
  nodeName?: string;
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  closest?: (selector: string) => unknown;
};

export type SceneButtonShortcutCandidate = {
  id: number;
  buttonNumber: number;
  name?: string | null;
};

export type SceneShortcutResolution<T extends SceneButtonShortcutCandidate> = {
  buttonNumber: number;
  sceneButton: T | null;
};

export const CONTROL_SURFACE_SCENE_SHORTCUTS = [
  { label: "Ctrl+Alt+1", buttonNumber: 1 },
  { label: "Ctrl+Alt+2", buttonNumber: 2 },
  { label: "Ctrl+Alt+3", buttonNumber: 3 },
  { label: "Ctrl+Alt+4", buttonNumber: 4 },
  { label: "Ctrl+Alt+5", buttonNumber: 5 },
  { label: "Ctrl+Alt+6", buttonNumber: 6 },
  { label: "Ctrl+Alt+7", buttonNumber: 7 },
  { label: "Ctrl+Alt+8", buttonNumber: 8 },
  { label: "Ctrl+Alt+9", buttonNumber: 9 },
  { label: "Ctrl+Alt+0", buttonNumber: 10 },
] as const;

const EDITABLE_TAGS = new Set(["input", "textarea", "select"]);
const EDITABLE_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);
const EDITABLE_TARGET_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]",
  "[role='textbox']",
  "[role='searchbox']",
  "[role='combobox']",
  "[role='spinbutton']",
].join(", ");
const DIALOG_TARGET_SELECTOR = "[role='dialog'], [data-radix-dialog-content]";

function targetLike(value: unknown): ShortcutTargetLike | null {
  return value && typeof value === "object" ? value as ShortcutTargetLike : null;
}

function normalizedTagName(target: ShortcutTargetLike) {
  return String(target.tagName ?? target.nodeName ?? "").toLowerCase();
}

function isContentEditableValue(value: string | null) {
  return value === "" || value?.toLowerCase() === "true";
}

function digitFromCode(code: string | undefined) {
  const digitMatch = code?.match(/^(?:Digit|Numpad)([0-9])$/);
  return digitMatch ? Number(digitMatch[1]) : null;
}

function digitFromKey(key: string | undefined) {
  return key && /^[0-9]$/.test(key) ? Number(key) : null;
}

function digitToSceneButtonNumber(digit: number | null) {
  if (digit === null) return null;
  return digit === 0 ? 10 : digit;
}

export function sceneButtonNumberFromShortcutEvent(event: ShortcutKeyEventLike) {
  if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey || event.repeat) {
    return null;
  }

  const digit = digitFromKey(event.key) ?? digitFromCode(event.code);
  return digitToSceneButtonNumber(digit);
}

export function isEditableShortcutTarget(value: unknown) {
  const target = targetLike(value);
  if (!target) return false;

  if (EDITABLE_TAGS.has(normalizedTagName(target))) return true;
  if (target.isContentEditable) return true;

  const contentEditable = target.getAttribute?.("contenteditable");
  if (isContentEditableValue(contentEditable ?? null)) return true;

  const role = target.getAttribute?.("role")?.toLowerCase() ?? null;
  if (role && EDITABLE_ROLES.has(role)) return true;

  if (typeof target.closest === "function" && target.closest(EDITABLE_TARGET_SELECTOR)) {
    return true;
  }

  return false;
}

export function isDialogShortcutTarget(value: unknown) {
  const target = targetLike(value);
  return Boolean(target && typeof target.closest === "function" && target.closest(DIALOG_TARGET_SELECTOR));
}

export function resolveControlSurfaceSceneShortcut<T extends SceneButtonShortcutCandidate>(
  event: ShortcutKeyEventLike,
  sceneButtons: readonly T[],
): SceneShortcutResolution<T> | null {
  if (isEditableShortcutTarget(event.target) || isDialogShortcutTarget(event.target)) {
    return null;
  }

  const buttonNumber = sceneButtonNumberFromShortcutEvent(event);
  if (!buttonNumber) return null;

  return {
    buttonNumber,
    sceneButton: sceneButtons.find((button) => button.buttonNumber === buttonNumber) ?? null,
  };
}
