export interface PresetRecallCameraState {
  tallyState?: string | null;
  isProgramOutput?: boolean | null;
}

export function requiresProgramRecallConfirmation(camera?: PresetRecallCameraState | null) {
  return camera?.tallyState === "program" || camera?.isProgramOutput === true;
}

export function normalizePresetName(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
