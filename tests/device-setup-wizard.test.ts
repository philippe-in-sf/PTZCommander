import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildDefaultCameraImportAssignments,
  buildDiscoveredCameraImportPayload,
  findDuplicateCameraImportAssignments,
  getDiscoveredCameraImportKey,
} from "@shared/camera-import";
import {
  DEVICE_SETUP_TYPES,
  buildSetupFinish,
  getDeviceSetupConfig,
  getInitialDeviceSetupStep,
  getSetupDiscoveryOptions,
  redactSensitiveSetupFields,
  type DeviceSetupType,
} from "@shared/device-setup-wizard";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("device setup config includes all supported device types", () => {
  assert.deepEqual(DEVICE_SETUP_TYPES, ["camera", "mixer", "switcher", "obs", "hue", "display"]);

  for (const type of DEVICE_SETUP_TYPES) {
    const config = getDeviceSetupConfig(type);
    assert.equal(config.type, type);
    assert.ok(config.label.length > 0);
    assert.ok(config.route.startsWith("/"));
    assert.ok(config.statusHint.length > 0);
  }
});

test("preselected device setup skips the generic type decision", () => {
  assert.equal(getInitialDeviceSetupStep(), "type");
  assert.equal(getInitialDeviceSetupStep("camera"), "mode");
  assert.equal(getInitialDeviceSetupStep("display"), "mode");
  assert.equal(getInitialDeviceSetupStep("mixer"), "details");
  assert.equal(getInitialDeviceSetupStep("switcher"), "details");
  assert.equal(getInitialDeviceSetupStep("obs"), "details");
  assert.equal(getInitialDeviceSetupStep("hue"), "details");
});

test("discovery-capable device types expose discovery options", () => {
  assert.deepEqual(getSetupDiscoveryOptions("camera"), ["visca"]);
  assert.deepEqual(getSetupDiscoveryOptions("display"), ["samsung", "hisense"]);
});

test("non-discovery device types go directly to manual details", () => {
  const manualOnlyTypes: DeviceSetupType[] = ["mixer", "switcher", "obs", "hue"];

  for (const type of manualOnlyTypes) {
    assert.deepEqual(getSetupDiscoveryOptions(type), []);
    assert.equal(getInitialDeviceSetupStep(type), "details");
  }
});

test("add and test converts create success plus test failure into a warning finish state", () => {
  const finish = buildSetupFinish({
    type: "obs",
    name: "Front Booth OBS",
    created: true,
    createdMessage: "Created OBS connection",
    testOk: false,
    testMessage: "OBS WebSocket refused the connection",
  });

  assert.equal(finish.status, "warning");
  assert.equal(finish.created, true);
  assert.equal(finish.warning, "OBS WebSocket refused the connection");
  assert.equal(finish.summary.connection, "OBS WebSocket refused the connection");
});

test("sensitive setup fields are not echoed into result summaries", () => {
  const redacted = redactSensitiveSetupFields({
    name: "Bridge",
    ip: "192.168.0.40",
    username: "admin",
    password: "super-secret",
    apiKey: "hue-secret",
    smartthingsToken: "cloud-token",
    samsungToken: "tv-token",
    hisensePassword: "display-secret",
    nested: {
      password: "nested-secret",
      host: "obs.local",
    },
  });

  assert.deepEqual(redacted, {
    name: "Bridge",
    ip: "192.168.0.40",
    username: "admin",
    password: "[redacted]",
    apiKey: "[redacted]",
    smartthingsToken: "[redacted]",
    samsungToken: "[redacted]",
    hisensePassword: "[redacted]",
    nested: {
      password: "[redacted]",
      host: "obs.local",
    },
  });
});

test("device setup provider is mounted inside the signed-in app shell", () => {
  const app = source("client/src/App.tsx");

  assert.match(app, /import \{ DeviceSetupProvider \}/);
  assert.match(app, /<DeviceSetupProvider>\s*<Shell \/>\s*<\/DeviceSetupProvider>/);
});

test("global and device-specific add actions open the setup wizard preselected", () => {
  const header = source("client/src/components/app-header.tsx");
  const dashboard = source("client/src/pages/dashboard.tsx");
  const mixerPanel = source("client/src/components/mixer/mixer-panel.tsx");
  const switcherPanel = source("client/src/components/switcher/atem-panel.tsx");
  const lighting = source("client/src/pages/lighting.tsx");
  const displays = source("client/src/pages/displays.tsx");

  assert.match(header, /button-global-add-device/);
  assert.match(header, /openDeviceSetup\(\)/);
  assert.match(dashboard, /openDeviceSetup\(\{ type: "camera" \}\)/);
  assert.match(dashboard, /onAddViaWizard=\{\(\) => openDeviceSetup\(\{ type: "obs" \}\)\}/);
  assert.match(mixerPanel, /openDeviceSetup\(\{ type: "mixer" \}\)/);
  assert.match(switcherPanel, /openDeviceSetup\(\{ type: "switcher" \}\)/);
  assert.match(lighting, /openDeviceSetup\(\{ type: "hue" \}\)/);
  assert.match(displays, /openDeviceSetup\(\{ type: "display" \}\)/);
});

test("singleton setup paths update existing mixer and switcher records", () => {
  const wizard = source("client/src/components/setup/device-setup-wizard.tsx");

  assert.match(wizard, /async function saveMixer\(\)/);
  assert.match(wizard, /const existingMixers = await mixerApi\.getAll\(\)/);
  assert.match(wizard, /if \(existingMixers\[0\]\) return mixerApi\.update\(existingMixers\[0\]\.id, payload\)/);
  assert.match(wizard, /alert-device-setup-existing-mixer/);

  assert.match(wizard, /async function saveSwitcher\(\)/);
  assert.match(wizard, /const existingSwitchers = await switcherApi\.getAll\(\)/);
  assert.match(wizard, /if \(existingSwitchers\[0\]\) return switcherApi\.update\(existingSwitchers\[0\]\.id, payload\)/);
  assert.match(wizard, /alert-device-setup-existing-switcher/);
});

test("camera discovery import review exposes assignment controls", () => {
  const dashboard = source("client/src/pages/dashboard.tsx");

  assert.match(dashboard, /buildDiscoveredCameraImportPayload/);
  assert.match(dashboard, /select-discovered-camera-assignment/);
});

test("camera settings expose post-import assignment controls", () => {
  const selector = source("client/src/components/ptz/camera-selector.tsx");

  assert.match(selector, /getCameraAssignmentNumberFromName/);
  assert.match(selector, /select-camera-assignment/);
  assert.match(selector, /Camera Assignment/);
  assert.match(selector, /camera-assignment-conflict/);
  assert.match(selector, /will move to Camera/);
});

test("camera import assignments default to the next free camera slots", () => {
  const discovered = [
    { ip: "192.168.0.27", port: 52381, name: "Camera 1", alreadyConfigured: false },
    { ip: "192.168.0.165", port: 52381, name: "Camera 2", alreadyConfigured: false },
  ];

  const assignments = buildDefaultCameraImportAssignments(
    [{ name: "Camera 1" }, { name: "Lobby" }],
    discovered,
  );

  assert.deepEqual(assignments, {
    "192.168.0.27:52381": 2,
    "192.168.0.165:52381": 3,
  });
});

test("camera import payload uses assignment names and creation order", () => {
  const discovered = [
    { ip: "192.168.0.165", port: 52381, name: "Camera 1", alreadyConfigured: false },
    { ip: "192.168.0.27", port: 52381, name: "Camera 2", alreadyConfigured: false },
  ];
  const assignments = {
    [getDiscoveredCameraImportKey(discovered[0])]: 2,
    [getDiscoveredCameraImportKey(discovered[1])]: 1,
  };

  assert.deepEqual(buildDiscoveredCameraImportPayload(discovered, assignments), [
    { ip: "192.168.0.27", port: 52381, name: "Camera 1", streamUrl: null },
    { ip: "192.168.0.165", port: 52381, name: "Camera 2", streamUrl: null },
  ]);
});

test("camera import assignments report duplicate selected slots", () => {
  const discovered = [
    { ip: "192.168.0.27", port: 52381, name: "Camera 1", alreadyConfigured: false },
    { ip: "192.168.0.165", port: 52381, name: "Camera 2", alreadyConfigured: false },
  ];
  const assignments = {
    [getDiscoveredCameraImportKey(discovered[0])]: 1,
    [getDiscoveredCameraImportKey(discovered[1])]: 1,
  };

  assert.deepEqual(findDuplicateCameraImportAssignments(discovered, assignments), [1]);
});
