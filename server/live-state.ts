import { patchLiveAppStateSchema, type LiveAppState } from "@shared/live-state";

let state: LiveAppState = {
  selectedCameraId: null,
  activeRunsheetCueId: null,
};

export function getLiveAppState(): LiveAppState {
  return state;
}

export function patchLiveAppState(value: unknown): LiveAppState {
  const patch = patchLiveAppStateSchema.parse(value);
  state = { ...state, ...patch };
  return state;
}
