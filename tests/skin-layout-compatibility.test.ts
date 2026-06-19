import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("alternate dashboard skins receive the shared preset management callback", () => {
  const skinTypes = source("client/src/components/skins/types.ts");
  const dashboard = source("client/src/pages/dashboard.tsx");

  assert.match(skinTypes, /onManagePreset:\s*\(preset:\s*Preset\)\s*=>\s*void/);
  assert.match(dashboard, /onManagePreset:\s*setManagingPreset/);
  assert.match(dashboard, /skinDashboard = <SkinComponent \{\.\.\.skinProps\} \/>/);
});

test("alternate dashboard skins render shared control-surface shortcut labels", () => {
  for (const path of [
    "client/src/components/skins/broadcast-console.tsx",
    "client/src/components/skins/command-center.tsx",
    "client/src/components/skins/studio-glass.tsx",
  ]) {
    const skinSource = source(path);

    assert.match(skinSource, /CONTROL_SURFACE_SCENE_SHORTCUTS/);
    assert.match(skinSource, /buttonNumber === scene\.buttonNumber/);
  }
});

test("skin selector stays open while moving over menu options", () => {
  const skinSelector = source("client/src/components/skin-selector.tsx");

  assert.doesNotMatch(skinSelector, /onMouseLeave=\{\(\) => setOpen\(false\)\}/);
  assert.match(skinSelector, /useRef<HTMLDivElement>/);
  assert.match(skinSelector, /document\.addEventListener\("pointerdown", closeOnOutsidePointer\)/);
  assert.match(skinSelector, /document\.addEventListener\("keydown", closeOnEscape\)/);
  assert.match(skinSelector, /role="menu"/);
  assert.match(skinSelector, /role="menuitem"/);
});
