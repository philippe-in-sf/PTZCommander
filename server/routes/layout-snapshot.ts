import type { RouteContext } from "./types";

type Storage = RouteContext["storage"];

export async function buildCurrentLayoutSnapshot(storage: Storage) {
  const allCameras = await storage.getAllCameras();
  const allPresets: any[] = [];
  for (const camera of allCameras) {
    const cameraPresets = await storage.getPresetsForCamera(camera.id);
    allPresets.push(...cameraPresets);
  }
  const allSceneButtons = await storage.getAllSceneButtons();
  const allMixers = await storage.getAllMixers();
  const allSwitchers = await storage.getAllSwitchers();
  const allObsConnections = await storage.getAllObsConnections();

  return JSON.stringify({
    cameras: allCameras.map((camera) => ({
      name: camera.name,
      ip: camera.ip,
      port: camera.port,
      protocol: camera.protocol,
      username: camera.username,
      password: camera.password,
      streamUrl: camera.streamUrl,
      previewType: camera.previewType,
      previewRefreshMs: camera.previewRefreshMs,
      atemInputId: camera.atemInputId,
    })),
    presets: allPresets.map((preset) => ({
      cameraIp: allCameras.find((camera) => camera.id === preset.cameraId)?.ip,
      presetNumber: preset.presetNumber,
      name: preset.name,
      pan: preset.pan,
      tilt: preset.tilt,
      zoom: preset.zoom,
      focus: preset.focus,
    })),
    sceneButtons: allSceneButtons.map((sceneButton) => ({
      buttonNumber: sceneButton.buttonNumber,
      name: sceneButton.name,
      color: sceneButton.color,
      atemInputId: sceneButton.atemInputId,
      atemTransitionType: sceneButton.atemTransitionType,
      obsSceneName: sceneButton.obsSceneName,
      cameraId: sceneButton.cameraId,
      presetNumber: sceneButton.presetNumber,
      mixerActions: sceneButton.mixerActions,
      hueActions: sceneButton.hueActions,
      displayActions: sceneButton.displayActions,
    })),
    mixers: allMixers.slice(0, 1).map((mixer) => ({
      name: mixer.name,
      ip: mixer.ip,
      port: mixer.port,
    })),
    switchers: allSwitchers.slice(0, 1).map((switcher) => ({
      name: switcher.name,
      ip: switcher.ip,
      type: switcher.type,
    })),
    obsConnections: allObsConnections.slice(0, 1).map((connection) => ({
      name: connection.name,
      host: connection.host,
      port: connection.port,
      password: connection.password,
    })),
  });
}
