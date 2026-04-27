import type { RouteContext } from "./types";
import { insertSceneButtonSchema, patchSceneButtonSchema, type Camera, type InsertSceneButton, type SceneButton } from "@shared/schema";
import { logger } from "../logger";
import { fromError } from "zod-validation-error";
import { getHueClient } from "../hue";
import type { ChannelState, MixerSection } from "../x32";
import type { AtemSwitcherState } from "../atem";
import { executeDisplayAction, refreshDisplayStatus } from "./display";
import { isRehearsalMode } from "../rehearsal";
import { z } from "zod";

type SceneSection = "atem" | "obs" | "mixer" | "hue" | "ptz" | "display";
type CaptureSection = Exclude<SceneSection, "ptz">;

interface MixerAction {
  section: MixerSection;
  channel: number;
  fader?: number;
  muted?: boolean;
  name?: string;
}

interface SceneAtemDskState {
  index: number;
  onAir?: boolean;
  tie?: boolean;
  rate?: number;
}

interface SceneAtemUskState {
  index: number;
  onAir?: boolean;
}

interface SceneAtemAuxState {
  index: number;
  sourceId: number;
}

interface SceneAtemState {
  programInput?: number | null;
  previewInput?: number | null;
  transitionStyle?: number;
  transitionPreview?: boolean;
  mixRate?: number;
  dipRate?: number;
  wipeRate?: number;
  fadeToBlackRate?: number;
  downstreamKeyers?: SceneAtemDskState[];
  upstreamKeyers?: SceneAtemUskState[];
  auxOutputs?: SceneAtemAuxState[];
}

interface AtemSceneControl {
  setPreviewInput(inputId: number): Promise<void>;
  setProgramInput(inputId: number): Promise<void>;
  setTransitionStyle(style: number): Promise<void>;
  setTransitionPreview(enabled: boolean): Promise<void>;
  setMixRate(rate: number): Promise<void>;
  setDipRate(rate: number): Promise<void>;
  setWipeRate(rate: number): Promise<void>;
  setFadeToBlackRate(rate: number): Promise<void>;
  setDSKRate(dskIndex: number, rate: number): Promise<void>;
  setDSKTie(dskIndex: number, tie: boolean): Promise<void>;
  setDSKOnAir(dskIndex: number, onAir: boolean): Promise<void>;
  setUSKOnAir(uskIndex: number, onAir: boolean): Promise<void>;
  setAuxSource(auxIndex: number, sourceId: number): Promise<void>;
}

interface HueAction {
  type: "scene" | "group" | "light";
  bridgeId: number;
  sceneId?: string;
  groupId?: string;
  lightId?: string;
  on?: boolean;
  brightness?: number;
  colorTemp?: number;
  hue?: number;
  sat?: number;
}

interface DisplayAction {
  displayId: number;
  command: "power_on" | "power_off" | "set_volume" | "mute" | "unmute" | "set_input" | "custom";
  value?: string | number | boolean;
  capability?: string;
  smartthingsCommand?: string;
  arguments?: unknown[];
}

const CAPTURE_SECTION_VALUES = ["atem", "obs", "mixer", "hue", "display"] as const;
const captureSectionSchema = z.enum(CAPTURE_SECTION_VALUES);
const captureSceneSchema = z.object({
  mode: z.enum(["create", "merge"]),
  targetSceneId: z.number().int().positive().optional(),
  sections: z.array(captureSectionSchema).min(1).max(CAPTURE_SECTION_VALUES.length),
  scene: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    buttonNumber: z.number().int().positive().optional(),
    groupName: z.string().trim().min(1).max(80).optional(),
    color: z.string().trim().min(4).max(32).optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  if (value.mode === "merge" && !value.targetSceneId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "targetSceneId is required when merging into an existing scene",
      path: ["targetSceneId"],
    });
  }
});

function parseJsonArray<T>(value: string | null): T[] | null {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseJsonObject<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as T : null;
  } catch {
    return null;
  }
}

function sectionEnabled(section: SceneSection, sections?: SceneSection[]) {
  return !sections || sections.includes(section);
}

function describeMixerActions(actions: MixerAction[]) {
  return actions
    .slice(0, 4)
    .map((action) => {
      const changes: string[] = [];
      if (action.fader !== undefined) changes.push(`fader ${Math.round(action.fader * 100)}%`);
      if (action.muted !== undefined) changes.push(action.muted ? "mute on" : "mute off");
      return `${action.section}/${action.channel}: ${changes.length > 0 ? changes.join(", ") : "no change"}`;
    })
    .join("; ");
}

function compactDefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function normalizeAtemState(state: SceneAtemState | null): SceneAtemState | null {
  if (!state) return null;

  const downstreamKeyers = Array.isArray(state.downstreamKeyers)
    ? state.downstreamKeyers.map((item) => compactDefined({
        index: item.index,
        onAir: item.onAir,
        tie: item.tie,
        rate: item.rate,
      }))
    : [];

  const upstreamKeyers = Array.isArray(state.upstreamKeyers)
    ? state.upstreamKeyers.map((item) => compactDefined({
        index: item.index,
        onAir: item.onAir,
      }))
    : [];

  const auxOutputs = Array.isArray(state.auxOutputs)
    ? state.auxOutputs
        .filter((item) => typeof item.index === "number" && typeof item.sourceId === "number")
        .map((item) => ({ index: item.index, sourceId: item.sourceId }))
    : [];

  return compactDefined({
    programInput: state.programInput ?? undefined,
    previewInput: state.previewInput ?? undefined,
    transitionStyle: state.transitionStyle,
    transitionPreview: state.transitionPreview,
    mixRate: state.mixRate,
    dipRate: state.dipRate,
    wipeRate: state.wipeRate,
    fadeToBlackRate: state.fadeToBlackRate,
    downstreamKeyers,
    upstreamKeyers,
    auxOutputs,
  });
}

function captureAtemSceneState(state: AtemSwitcherState): SceneAtemState {
  return normalizeAtemState({
    programInput: state.programInput || undefined,
    previewInput: state.previewInput || undefined,
    transitionStyle: state.transition.nextStyle,
    transitionPreview: state.transition.previewEnabled,
    mixRate: state.transition.mixRate,
    dipRate: state.transition.dipRate,
    wipeRate: state.transition.wipeRate,
    fadeToBlackRate: state.fadeToBlack.rate,
    downstreamKeyers: state.downstreamKeyers.map((item) => ({
      index: item.index,
      onAir: item.onAir,
      tie: item.tie,
      rate: item.rate,
    })),
    upstreamKeyers: state.upstreamKeyers.map((item) => ({
      index: item.index,
      onAir: item.onAir,
    })),
    auxOutputs: state.auxOutputs.map((sourceId, index) => ({
      index,
      sourceId,
    })),
  }) || {};
}

async function applyAtemSceneState(
  client: AtemSceneControl,
  state: SceneAtemState,
) {
  if (state.previewInput) {
    await client.setPreviewInput(state.previewInput);
  }
  if (state.transitionStyle !== undefined) {
    await client.setTransitionStyle(state.transitionStyle);
  }
  if (state.transitionPreview !== undefined) {
    await client.setTransitionPreview(state.transitionPreview);
  }
  if (state.mixRate !== undefined) {
    await client.setMixRate(state.mixRate);
  }
  if (state.dipRate !== undefined) {
    await client.setDipRate(state.dipRate);
  }
  if (state.wipeRate !== undefined) {
    await client.setWipeRate(state.wipeRate);
  }
  if (state.fadeToBlackRate !== undefined) {
    await client.setFadeToBlackRate(state.fadeToBlackRate);
  }

  for (const dsk of state.downstreamKeyers || []) {
    if (dsk.rate !== undefined) await client.setDSKRate(dsk.index, dsk.rate);
    if (dsk.tie !== undefined) await client.setDSKTie(dsk.index, dsk.tie);
    if (dsk.onAir !== undefined) await client.setDSKOnAir(dsk.index, dsk.onAir);
  }

  for (const usk of state.upstreamKeyers || []) {
    if (usk.onAir !== undefined) await client.setUSKOnAir(usk.index, usk.onAir);
  }

  for (const aux of state.auxOutputs || []) {
    await client.setAuxSource(aux.index, aux.sourceId);
  }

  if (state.programInput) {
    await client.setProgramInput(state.programInput);
  }
}

function describeAtemSceneState(state: SceneAtemState) {
  const details: string[] = [];
  if (state.programInput) details.push(`program ${state.programInput}`);
  if (state.previewInput) details.push(`preview ${state.previewInput}`);
  if (state.auxOutputs && state.auxOutputs.length > 0) details.push(`${state.auxOutputs.length} aux`);
  if (state.downstreamKeyers && state.downstreamKeyers.length > 0) details.push(`${state.downstreamKeyers.length} DSK`);
  if (state.upstreamKeyers && state.upstreamKeyers.length > 0) details.push(`${state.upstreamKeyers.length} USK`);
  return details.join(", ");
}

function buildMixerActionsFromStates(states: Partial<Record<MixerSection, ChannelState[]>>) {
  const sectionOrder: MixerSection[] = ["ch", "bus", "auxin", "fxrtn", "mtx", "dca", "main"];
  return sectionOrder.flatMap((section) =>
    (states[section] || []).map((state) => ({
      section,
      channel: state.channel,
      fader: state.fader,
      muted: state.muted,
      name: state.name,
    })),
  );
}

function buildDisplayActionsFromState(displays: Array<{
  id: number;
  name: string;
  powerState: string | null;
  volume: number | null;
  muted: boolean;
  inputSource: string | null;
}>) {
  const actions: DisplayAction[] = [];

  for (const display of displays) {
    if (display.powerState === "on") {
      actions.push({ displayId: display.id, command: "power_on" });
    } else if (display.powerState === "off") {
      actions.push({ displayId: display.id, command: "power_off" });
    }

    if (typeof display.volume === "number") {
      actions.push({ displayId: display.id, command: "set_volume", value: display.volume });
    }

    actions.push({ displayId: display.id, command: display.muted ? "mute" : "unmute" });

    if (display.inputSource) {
      actions.push({ displayId: display.id, command: "set_input", value: display.inputSource });
    }
  }

  return actions;
}

function describeCameraRouting(cameras: Camera[], atemState: AtemSwitcherState) {
  const details: string[] = [];
  const programCamera = cameras.find((camera) => camera.atemInputId === atemState.programInput);
  const previewCamera = cameras.find((camera) => camera.atemInputId === atemState.previewInput);

  if (programCamera) details.push(`program ${programCamera.name}`);
  if (previewCamera) details.push(`preview ${previewCamera.name}`);

  return details.length > 0 ? `Cameras: routing preserved inside ATEM snapshot (${details.join(" · ")})` : null;
}

async function captureSceneSections(
  ctx: RouteContext,
  sections: CaptureSection[],
  options?: { mergeTarget?: SceneButton | null },
) {
  const { storage, atemManager, obsManager, x32Manager } = ctx;
  const results: string[] = [];
  const warnings: string[] = [];
  const updates: Partial<SceneButton> = {};
  const sectionSet = new Set<CaptureSection>(sections);
  const mergeTarget = options?.mergeTarget ?? null;

  const cameraPromise = sectionSet.has("atem") ? storage.getAllCameras() : Promise.resolve([]);
  const obsConnectionsPromise = sectionSet.has("obs") ? storage.getAllObsConnections() : Promise.resolve([]);
  const hueBridgesPromise = sectionSet.has("hue") ? storage.getAllHueBridges() : Promise.resolve([]);
  const displaysPromise = sectionSet.has("display") ? storage.getAllDisplayDevices() : Promise.resolve([]);

  if (sectionSet.has("atem")) {
    const atemState = atemManager.getState();
    if (atemState?.connected) {
      const sceneState = captureAtemSceneState(atemState);
      updates.atemState = JSON.stringify(sceneState);
      updates.atemInputId = sceneState.programInput ?? null;
      updates.atemTransitionType = mergeTarget?.atemTransitionType || "cut";
      results.push(`ATEM: captured ${describeAtemSceneState(sceneState) || "live switcher state"}`);

      const cameras = await cameraPromise;
      const routing = describeCameraRouting(cameras, atemState);
      if (routing) {
        results.push(routing);
      } else if (cameras.length > 0) {
        warnings.push("Cameras: no configured camera matched the live ATEM program/preview inputs, so only the raw switcher routing was saved.");
      }
    } else {
      warnings.push("ATEM: skipped because the switcher is not connected.");
    }
  }

  if (sectionSet.has("obs")) {
    const obsClient = obsManager.getClient();
    const obsConnections = await obsConnectionsPromise;
    const savedConnection = obsConnections[0] ?? null;
    let sceneName: string | null = null;

    if (obsClient && obsClient.isConnected()) {
      try {
        const liveState = await obsClient.refreshState();
        sceneName = liveState.currentProgramScene;
      } catch {
        sceneName = obsClient.getState().currentProgramScene;
        if (sceneName) {
          warnings.push("OBS: used the current in-memory program scene because a live refresh failed.");
        }
      }
    } else if (savedConnection?.currentProgramScene) {
      sceneName = savedConnection.currentProgramScene;
      warnings.push("OBS: connection was offline, so the snapshot used the last known program scene.");
    }

    if (sceneName) {
      updates.obsSceneName = sceneName;
      results.push(`OBS: captured program scene ${sceneName}`);
    } else if (!savedConnection) {
      warnings.push("OBS: skipped because no OBS connection is configured.");
    } else {
      warnings.push("OBS: skipped because no readable program scene was available.");
    }
  }

  if (sectionSet.has("mixer")) {
    const mixerClient = x32Manager.getClient();
    if (mixerClient && mixerClient.isConnected()) {
      const actions = buildMixerActionsFromStates(mixerClient.getAllStates());
      updates.mixerActions = actions.length > 0 ? JSON.stringify(actions) : null;
      results.push(`Mixer: captured ${actions.length} channel state${actions.length === 1 ? "" : "s"}`);
    } else {
      warnings.push("Mixer: skipped because the X32 mixer is not connected.");
    }
  }

  if (sectionSet.has("hue")) {
    const hueBridges = await hueBridgesPromise;
    if (hueBridges.length === 0) {
      warnings.push("Lighting: skipped because no Hue bridge is configured.");
    } else {
      const settled = await Promise.all(
        hueBridges.map(async (bridge) => {
          try {
            const client = getHueClient(bridge.id);
            if (!client) {
              throw new Error(`${bridge.name} is not connected`);
            }
            const lights = await client.getLights();
            return {
              ok: true as const,
              bridgeName: bridge.name,
              actions: lights.map((light) => ({
                type: "light" as const,
                bridgeId: bridge.id,
                lightId: light.id,
                on: light.on,
                brightness: light.brightness,
                colorTemp: light.colorTemp,
                hue: light.hue,
                sat: light.sat,
              })),
            };
          } catch (error) {
            return {
              ok: false as const,
              bridgeName: bridge.name,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      const actions = settled.flatMap((entry) => entry.ok ? entry.actions : []);
      for (const entry of settled) {
        if (!entry.ok) warnings.push(`Lighting: ${entry.bridgeName} skipped because ${entry.error}.`);
      }
      if (actions.length > 0) {
        updates.hueActions = JSON.stringify(actions);
        results.push(`Lighting: captured ${actions.length} light state${actions.length === 1 ? "" : "s"}`);
      } else if (warnings.length === 0 || !warnings.some((warning) => warning.startsWith("Lighting:"))) {
        warnings.push("Lighting: skipped because no readable light state was available.");
      }
    }
  }

  if (sectionSet.has("display")) {
    const displays = await displaysPromise;
    if (displays.length === 0) {
      warnings.push("Displays: skipped because no displays are configured.");
    } else {
      const refreshedDisplays = await Promise.all(
        displays.map(async (display) => {
          try {
            return await refreshDisplayStatus(ctx, display.id, { markOfflineOnFailure: false });
          } catch {
            warnings.push(`Displays: ${display.name} used its last known state because a live refresh failed.`);
            return display;
          }
        }),
      );
      const actions = buildDisplayActionsFromState(refreshedDisplays);
      updates.displayActions = actions.length > 0 ? JSON.stringify(actions) : null;
      results.push(`Displays: captured ${actions.length} command${actions.length === 1 ? "" : "s"} from live state`);
    }
  }

  const hasConfiguredCameras = sectionSet.has("atem")
    ? (await cameraPromise).length > 0
    : (await storage.getAllCameras()).length > 0;
  if (hasConfiguredCameras) {
    const ptzMergeNote = mergeTarget?.cameraId !== null && mergeTarget?.cameraId !== undefined && mergeTarget?.presetNumber !== null && mergeTarget?.presetNumber !== undefined
      ? " Any existing PTZ preset link on the target scene was left unchanged."
      : " Add a saved PTZ preset manually if you want this scene to recall a camera move.";
    warnings.push(`Cameras: live PTZ pose capture is not available yet, so the snapshot only saved camera routing through the switcher state.${ptzMergeNote}`);
  }

  return { updates, results, warnings };
}

function getNextSceneButtonNumber(sceneButtons: SceneButton[]) {
  return sceneButtons.length > 0
    ? Math.max(...sceneButtons.map((scene) => scene.buttonNumber)) + 1
    : 1;
}

function getScenePreview(button: SceneButton) {
  const preview: string[] = [];
  const atemState = normalizeAtemState(parseJsonObject<SceneAtemState>(button.atemState));
  if (atemState) {
    preview.push(`ATEM: ${describeAtemSceneState(atemState) || "state captured"}`);
  } else if (button.atemInputId !== null && button.atemInputId !== undefined) {
    preview.push(`ATEM: ${button.atemTransitionType === "auto" ? "auto transition" : "cut"} to input ${button.atemInputId}`);
  }
  if (button.obsSceneName) {
    preview.push(`OBS: switch program scene to ${button.obsSceneName}`);
  }
  if (button.cameraId !== null && button.cameraId !== undefined && button.presetNumber !== null && button.presetNumber !== undefined) {
    preview.push(`PTZ: camera ${button.cameraId} recalls preset ${button.presetNumber + 1}`);
  }
  const mixerActions = parseJsonArray<MixerAction>(button.mixerActions);
  if (mixerActions === null) preview.push("Mixer: invalid action data");
  else if (mixerActions.length > 0) preview.push(`Mixer: ${mixerActions.length} channel action(s)`);
  const hueActions = parseJsonArray<HueAction>(button.hueActions);
  if (hueActions === null) preview.push("Hue: invalid action data");
  else if (hueActions.length > 0) preview.push(`Hue: ${hueActions.length} lighting action(s)`);
  const displayActions = parseJsonArray<DisplayAction>(button.displayActions);
  if (displayActions === null) preview.push("Displays: invalid action data");
  else if (displayActions.length > 0) preview.push(`Displays: ${displayActions.length} action(s)`);
  return preview.length > 0 ? preview : ["No hardware actions configured"];
}

export function registerSceneRoutes(ctx: RouteContext) {
  const { app, storage, cameraManager, x32Manager, atemManager, obsManager, broadcast, pushUndo, addSessionLog } = ctx;

  async function executeSceneButton(button: SceneButton, sections?: SceneSection[]) {
    const results: string[] = [];
    const undoSteps: Array<() => Promise<void>> = [];
    const rehearsal = isRehearsalMode();
    const atemSceneState = normalizeAtemState(parseJsonObject<SceneAtemState>(button.atemState));

    if (sectionEnabled("atem", sections) && (atemSceneState || button.atemInputId !== null && button.atemInputId !== undefined)) {
      if (rehearsal) {
        if (atemSceneState) {
          results.push(`REHEARSAL: ATEM would restore ${describeAtemSceneState(atemSceneState) || "captured switcher state"}; live output suppressed`);
        } else {
          results.push(`REHEARSAL: ATEM would switch to input ${button.atemInputId} (${button.atemTransitionType}); live output suppressed`);
        }
      } else {
        const atemClient = atemManager.getClient();
        if (atemClient && atemClient.isConnected()) {
          const previous = atemClient.getState();
          undoSteps.push(async () => {
            const currentClient = atemManager.getClient();
            if (!currentClient || !currentClient.isConnected()) return;
            await applyAtemSceneState(currentClient, captureAtemSceneState(previous));
          });
          if (atemSceneState) {
            await applyAtemSceneState(atemClient, atemSceneState);
            results.push(`ATEM: restored ${describeAtemSceneState(atemSceneState) || "captured switcher state"}`);
          } else {
            if (button.atemTransitionType === "auto") {
              await atemClient.setPreviewInput(button.atemInputId!);
              await atemClient.autoTransition();
            } else {
              await atemClient.setProgramInput(button.atemInputId!);
            }
            results.push(`ATEM: switched to input ${button.atemInputId} (${button.atemTransitionType})`);
          }
        } else {
          results.push("ATEM: not connected, skipped");
        }
      }
    }

    if (sectionEnabled("obs", sections) && button.obsSceneName) {
      if (rehearsal) {
        results.push(`REHEARSAL: OBS would switch to scene ${button.obsSceneName}; live output suppressed`);
      } else {
        const obsClient = obsManager.getClient();
        if (obsClient && obsClient.isConnected()) {
          const previousScene = obsClient.getState().currentProgramScene;
          if (previousScene) {
            undoSteps.push(async () => {
              const currentClient = obsManager.getClient();
              if (!currentClient || !currentClient.isConnected()) return;
              await currentClient.setCurrentProgramScene(previousScene);
            });
          }
          await obsClient.setCurrentProgramScene(button.obsSceneName);
          results.push(`OBS: switched to scene ${button.obsSceneName}`);
        } else {
          results.push("OBS: not connected, skipped");
        }
      }
    }

    if (sectionEnabled("mixer", sections) && button.mixerActions) {
      const actions = parseJsonArray<MixerAction>(button.mixerActions);
      if (actions === null) {
        results.push("Mixer: invalid actions data");
      } else if (rehearsal) {
        const preview = describeMixerActions(actions);
        const suffix = actions.length > 4 ? `; +${actions.length - 4} more` : "";
        results.push(`REHEARSAL: Mixer would apply ${actions.length} channel action(s); X32 writes suppressed${preview ? ` (${preview}${suffix})` : ""}`);
      } else {
        const mixerClient = x32Manager.getClient();
        if (mixerClient && mixerClient.isConnected()) {
          const snapshots = new Map<string, ChannelState>();
          for (const action of actions) {
            if (action.section && action.channel !== undefined) {
              const key = `${action.section}:${action.channel}`;
              const current = mixerClient.getSectionStates(action.section).find((state) => state.channel === action.channel);
              if (current && !snapshots.has(key)) {
                snapshots.set(key, { ...current });
              }
              if (action.fader !== undefined) {
                mixerClient.setSectionFader(action.section, action.channel, action.fader);
              }
              if (action.muted !== undefined) {
                mixerClient.setSectionMute(action.section, action.channel, action.muted);
              }
            }
          }
          if (snapshots.size > 0) {
            undoSteps.push(async () => {
              const currentClient = x32Manager.getClient();
              if (!currentClient || !currentClient.isConnected()) return;
              for (const snapshot of Array.from(snapshots.values())) {
                currentClient.setSectionFader(snapshot.section, snapshot.channel, snapshot.fader);
                currentClient.setSectionMute(snapshot.section, snapshot.channel, snapshot.muted);
              }
            });
          }
          results.push(`Mixer: applied ${actions.length} channel action(s)`);
        } else {
          results.push("Mixer: not connected, skipped");
        }
      }
    }

    if (sectionEnabled("hue", sections) && button.hueActions) {
      const hueActions = parseJsonArray<HueAction>(button.hueActions);
      if (hueActions === null) {
        results.push("Hue: invalid actions data");
      } else {
        for (const action of hueActions) {
          const hueClient = getHueClient(action.bridgeId);
          if (!hueClient) {
            results.push(`Hue: bridge ${action.bridgeId} not connected`);
            continue;
          }
          if (action.type === "scene" && action.sceneId) {
            try {
              if (action.groupId) {
                const groups = await hueClient.getGroups();
                const snapshot = groups.find((group) => group.id === action.groupId);
                if (snapshot) {
                  undoSteps.push(async () => {
                    const currentClient = getHueClient(action.bridgeId);
                    if (currentClient) await currentClient.setGroupState(action.groupId!, { on: snapshot.on, bri: snapshot.brightness });
                  });
                }
              } else {
                const lights = await hueClient.getLights();
                undoSteps.push(async () => {
                  const currentClient = getHueClient(action.bridgeId);
                  if (!currentClient) return;
                  for (const light of lights) {
                    await currentClient.setLightState(light.id, {
                      on: light.on,
                      bri: light.brightness,
                      ct: light.colorTemp,
                      hue: light.hue,
                      sat: light.sat,
                    });
                  }
                });
              }
            } catch {
              results.push("Hue: rollback snapshot unavailable");
            }
            await hueClient.activateScene(action.sceneId, action.groupId);
            results.push(`Hue: activated scene ${action.sceneId}`);
          } else if (action.type === "group" && action.groupId) {
            try {
              const groups = await hueClient.getGroups();
              const snapshot = groups.find((group) => group.id === action.groupId);
              if (snapshot) {
                undoSteps.push(async () => {
                  const currentClient = getHueClient(action.bridgeId);
                  if (currentClient) await currentClient.setGroupState(action.groupId!, { on: snapshot.on, bri: snapshot.brightness });
                });
              }
            } catch {
              results.push("Hue: rollback snapshot unavailable");
            }
            const state: any = {};
            if (action.on !== undefined) state.on = action.on;
            if (action.brightness !== undefined) state.bri = action.brightness;
            if (action.colorTemp !== undefined) state.ct = action.colorTemp;
            if (action.hue !== undefined) state.hue = action.hue;
            if (action.sat !== undefined) state.sat = action.sat;
            await hueClient.setGroupState(action.groupId, state);
            results.push(`Hue: updated group ${action.groupId}`);
          } else if (action.type === "light" && action.lightId) {
            try {
              const lights = await hueClient.getLights();
              const snapshot = lights.find((light) => light.id === action.lightId);
              if (snapshot) {
                undoSteps.push(async () => {
                  const currentClient = getHueClient(action.bridgeId);
                  if (currentClient) {
                    await currentClient.setLightState(action.lightId!, {
                      on: snapshot.on,
                      bri: snapshot.brightness,
                      ct: snapshot.colorTemp,
                      hue: snapshot.hue,
                      sat: snapshot.sat,
                    });
                  }
                });
              }
            } catch {
              results.push("Hue: rollback snapshot unavailable");
            }
            const state: any = {};
            if (action.on !== undefined) state.on = action.on;
            if (action.brightness !== undefined) state.bri = action.brightness;
            if (action.colorTemp !== undefined) state.ct = action.colorTemp;
            if (action.hue !== undefined) state.hue = action.hue;
            if (action.sat !== undefined) state.sat = action.sat;
            await hueClient.setLightState(action.lightId, state);
            results.push(`Hue: updated light ${action.lightId}`);
          }
        }
      }
    }

    if (sectionEnabled("display", sections) && button.displayActions) {
      const displayActions = parseJsonArray<DisplayAction>(button.displayActions);
      if (displayActions === null) {
        results.push("Displays: invalid actions data");
      } else {
        for (const action of displayActions) {
          await executeDisplayAction(ctx, action);
        }
        results.push(`Displays: applied ${displayActions.length} action(s)`);
      }
    }

    if (sectionEnabled("ptz", sections) && button.cameraId !== null && button.cameraId !== undefined && button.presetNumber !== null && button.presetNumber !== undefined) {
      const connectedIds = cameraManager.getConnectedCameraIds();
      const camClient = cameraManager.getClient(button.cameraId);
      logger.info("system", `Scene PTZ: cameraId=${button.cameraId}, presetNumber=${button.presetNumber}, connectedCameras=[${connectedIds.join(',')}], clientFound=${!!camClient}, connected=${camClient?.isConnected()}`);
      if (camClient && camClient.isConnected()) {
        camClient.recallPreset(button.presetNumber);
        results.push(`PTZ: camera ${button.cameraId} recalled preset ${button.presetNumber + 1}`);
      } else {
        results.push(`PTZ: camera ${button.cameraId} not connected (connected cameras: ${connectedIds.length > 0 ? connectedIds.join(',') : 'none'})`);
      }
    }

    return { results, undoSteps };
  }

  app.get("/api/scene-buttons", async (_req, res) => {
    try {
      const buttons = await storage.getAllSceneButtons();
      res.json(buttons);
    } catch (error) {
      res.status(500).json({ message: "Failed to get scene buttons" });
    }
  });

  app.post("/api/scene-buttons/capture", async (req, res) => {
    try {
      const parsed = captureSceneSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).toString() });
      }

      const mergeTarget = parsed.data.mode === "merge" && parsed.data.targetSceneId
        ? await storage.getSceneButton(parsed.data.targetSceneId)
        : null;

      if (parsed.data.mode === "merge" && !mergeTarget) {
        return res.status(404).json({ message: "Target scene not found" });
      }

      const capture = await captureSceneSections(ctx, parsed.data.sections, { mergeTarget });
      if (capture.results.length === 0) {
        return res.status(409).json({
          message: capture.warnings[0] || "No live state was available for the selected sections",
          warnings: capture.warnings,
        });
      }

      let scene: SceneButton | undefined;

      if (parsed.data.mode === "merge" && mergeTarget) {
        scene = await storage.updateSceneButton(mergeTarget.id, capture.updates);
      } else {
        const existingScenes = await storage.getAllSceneButtons();
        const buttonNumber = parsed.data.scene?.buttonNumber ?? getNextSceneButtonNumber(existingScenes);
        const createPayload: InsertSceneButton = {
          buttonNumber,
          name: parsed.data.scene?.name?.trim() || `Scene ${buttonNumber}`,
          groupName: parsed.data.scene?.groupName?.trim() || "General",
          color: parsed.data.scene?.color?.trim() || "#06b6d4",
          atemInputId: null,
          atemState: null,
          atemTransitionType: "cut",
          obsSceneName: null,
          cameraId: null,
          presetNumber: null,
          mixerActions: null,
          hueActions: null,
          displayActions: null,
          ...capture.updates,
        };
        scene = await storage.createSceneButton(createPayload);
      }

      if (!scene) {
        return res.status(500).json({ message: "Scene capture did not produce a saved scene" });
      }

      logger.info("scene", `Scene ${parsed.data.mode === "merge" ? "merged from" : "created from"} live capture: ${scene.name}`, {
        action: parsed.data.mode === "merge" ? "scene_button:capture_merge" : "scene_button:capture_create",
        details: {
          buttonId: scene.id,
          sections: parsed.data.sections,
          warnings: capture.warnings,
          results: capture.results,
        },
      });
      addSessionLog("scene", parsed.data.mode === "merge" ? "Merge Scene Capture" : "Capture Scene", `Saved ${scene.name} from live device state`);
      broadcast({ type: "invalidate", keys: ["scene-buttons"] });
      res.json({
        success: true,
        mode: parsed.data.mode,
        scene,
        results: capture.results,
        warnings: capture.warnings,
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to capture current scene state" });
    }
  });

  app.post("/api/scene-buttons", async (req, res) => {
    try {
      const result = insertSceneButtonSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const button = await storage.createSceneButton(result.data);
      logger.info("system", `Scene button created: ${button.name}`, { action: "scene_button:create", details: { buttonId: button.id, name: button.name } });
      broadcast({ type: "invalidate", keys: ["scene-buttons"] });
      res.json(button);
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to create scene button" });
    }
  });

  app.patch("/api/scene-buttons/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const result = patchSceneButtonSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: fromError(result.error).toString() });
      }
      const button = await storage.updateSceneButton(id, result.data);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }
      broadcast({ type: "invalidate", keys: ["scene-buttons"] });
      res.json(button);
    } catch (error) {
      res.status(500).json({ message: "Failed to update scene button" });
    }
  });

  app.delete("/api/scene-buttons/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSceneButton(id);
      logger.info("system", `Scene button deleted`, { action: "scene_button:delete", details: { buttonId: id } });
      broadcast({ type: "invalidate", keys: ["scene-buttons"] });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete scene button" });
    }
  });

  app.get("/api/scene-buttons/:id/preview", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const button = await storage.getSceneButton(id);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }
      res.json({ preview: getScenePreview(button) });
    } catch {
      res.status(500).json({ message: "Failed to preview scene button" });
    }
  });

  app.post("/api/scene-buttons/:id/test", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const section = req.body?.section as SceneSection | undefined;
      if (!section || !["atem", "obs", "mixer", "hue", "ptz", "display"].includes(section)) {
        return res.status(400).json({ message: "Invalid scene test section" });
      }
      const button = await storage.getSceneButton(id);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }

      const { results, undoSteps } = await executeSceneButton(button, [section]);
      if (undoSteps.length > 0) {
        pushUndo({
          type: "scene_test",
          description: `Test ${section.toUpperCase()} for scene "${button.name}"`,
          timestamp: Date.now(),
          undo: async () => {
            for (const step of [...undoSteps].reverse()) await step();
          },
        });
      }
      logger.info("system", `Scene button test: ${button.name}`, { action: "scene_button:test", details: { buttonId: id, section, results } });
      addSessionLog("scene", "Scene Test", `Tested ${section.toUpperCase()} for scene "${button.name}"`);
      broadcast({ type: "invalidate", keys: ["undo-status"] });
      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to test scene button" });
    }
  });

  app.post("/api/scene-buttons/:id/execute", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const button = await storage.getSceneButton(id);
      if (!button) {
        return res.status(404).json({ message: "Scene button not found" });
      }

      const { results, undoSteps } = await executeSceneButton(button);

      logger.info("system", `Scene button executed: ${button.name}`, { action: "scene_button:execute", details: { buttonId: id, results } });
      addSessionLog("scene", "Scene Execute", `Scene "${button.name}" executed`);
      if (undoSteps.length > 0) {
        pushUndo({
          type: "scene_execute",
          description: `Execute scene "${button.name}"`,
          timestamp: Date.now(),
          undo: async () => {
            for (const step of [...undoSteps].reverse()) await step();
          },
        });
        broadcast({ type: "invalidate", keys: ["undo-status"] });
      }
      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ message: error.message || "Failed to execute scene button" });
    }
  });
}
