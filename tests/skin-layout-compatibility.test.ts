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

test("alternate dashboard skins expose all eight ATEM inputs", () => {
  for (const path of [
    "client/src/components/skins/broadcast-console.tsx",
    "client/src/components/skins/command-center.tsx",
    "client/src/components/skins/studio-glass.tsx",
  ]) {
    assert.match(source(path), /displayInputs\.slice\(0, 8\)/);
  }
});

test("all dashboard skins expose the shared camera, OBS, and lighting panels", () => {
  const skinTypes = source("client/src/components/skins/types.ts");
  const dashboard = source("client/src/pages/dashboard.tsx");

  for (const prop of ["cameraSelectorPanel", "obsPanel", "lightingPanel"]) {
    assert.match(skinTypes, new RegExp(`${prop}: ReactNode`));
    assert.match(dashboard, new RegExp(`${prop}[,:]`));
  }

  for (const path of [
    "client/src/components/skins/broadcast-console.tsx",
    "client/src/components/skins/command-center.tsx",
    "client/src/components/skins/studio-glass.tsx",
  ]) {
    const skinSource = source(path);

    assert.match(skinSource, /props\.cameraSelectorPanel/);
    assert.match(skinSource, /props\.obsPanel/);
    assert.match(skinSource, /props\.lightingPanel/);
  }
});

test("dashboard skins use ATEM multiview without the legacy camera preview pane", () => {
  for (const path of [
    "client/src/pages/dashboard.tsx",
    "client/src/components/skins/broadcast-console.tsx",
    "client/src/components/skins/command-center.tsx",
    "client/src/components/skins/studio-glass.tsx",
  ]) {
    const dashboardSource = source(path);

    assert.match(dashboardSource, /<AtemMultiview\s*\/>/);
    assert.doesNotMatch(dashboardSource, /<CameraPreview\b/);
    assert.doesNotMatch(dashboardSource, /<CameraMonitor\b/);
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
