import type { Camera, InsertPreset, Preset } from "@shared/schema";

export interface PresetThumbnailStorage {
  getPresetById(id: number): Promise<Preset | undefined>;
  getCamera(id: number): Promise<Camera | undefined>;
  savePreset(preset: InsertPreset): Promise<Preset>;
}

export type PresetThumbnailCapture = (url: string) => Promise<string | null>;

export async function refreshPresetThumbnail(
  storage: PresetThumbnailStorage,
  presetId: number,
  captureSnapshot: PresetThumbnailCapture,
) {
  const preset = await storage.getPresetById(presetId);
  if (!preset) {
    throw new Error("Preset not found");
  }

  const camera = await storage.getCamera(preset.cameraId);
  if (!camera) {
    throw new Error("Camera not found");
  }

  if (!camera.streamUrl) {
    throw new Error(`No preview URL configured for ${camera.name}`);
  }

  const thumbnail = await captureSnapshot(camera.streamUrl);
  if (!thumbnail) {
    throw new Error(`Could not capture thumbnail for ${camera.name}`);
  }

  return storage.savePreset({
    cameraId: preset.cameraId,
    presetNumber: preset.presetNumber,
    name: preset.name,
    thumbnail,
    pan: preset.pan,
    tilt: preset.tilt,
    zoom: preset.zoom,
    focus: preset.focus,
  });
}
