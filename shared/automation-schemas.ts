import { z } from "zod";

export const AUTOMATION_SCHEMA_VERSION = 1;

const mixerSectionSchema = z.enum(["ch", "bus", "auxin", "fxrtn", "mtx", "dca", "main"]);
const displayCommandSchema = z.enum(["power_on", "power_off", "power_toggle", "set_volume", "volume_up", "volume_down", "mute", "unmute", "set_input", "custom"]);
const optionalValueSchema = z.union([z.string(), z.number(), z.boolean()]).optional();

export const mixerActionSchema = z.object({
  section: mixerSectionSchema,
  channel: z.number().int().min(1).max(128),
  fader: z.number().min(0).max(1).optional(),
  muted: z.boolean().optional(),
  name: z.string().max(120).optional(),
}).passthrough();

export const hueActionSchema = z.object({
  type: z.enum(["scene", "group", "light"]),
  bridgeId: z.number().int().positive(),
  sceneId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  lightId: z.string().min(1).optional(),
  on: z.boolean().optional(),
  brightness: z.number().int().min(0).max(254).optional(),
  colorTemp: z.number().int().min(150).max(500).optional(),
  hue: z.number().int().min(0).max(65535).optional(),
  sat: z.number().int().min(0).max(254).optional(),
}).passthrough();

export const displayActionSchema = z.object({
  displayId: z.number().int().positive(),
  command: displayCommandSchema,
  value: optionalValueSchema,
  capability: z.string().optional(),
  smartthingsCommand: z.string().optional(),
  arguments: z.array(z.unknown()).optional(),
  displayName: z.string().optional(),
}).passthrough();

const dskStateSchema = z.object({
  index: z.number().int().min(0).max(255),
  onAir: z.boolean().optional(),
  tie: z.boolean().optional(),
  rate: z.number().int().min(1).max(1000).optional(),
}).passthrough();

const uskStateSchema = z.object({
  index: z.number().int().min(0).max(255),
  onAir: z.boolean().optional(),
}).passthrough();

const auxStateSchema = z.object({
  index: z.number().int().min(0).max(255),
  sourceId: z.number().int().min(0).max(100000),
}).passthrough();

export const sceneAtemStateSchema = z.object({
  programInput: z.number().int().min(0).max(100000).nullable().optional(),
  previewInput: z.number().int().min(0).max(100000).nullable().optional(),
  transitionStyle: z.number().int().min(0).max(4).optional(),
  transitionPreview: z.boolean().optional(),
  mixRate: z.number().int().min(1).max(1000).optional(),
  dipRate: z.number().int().min(1).max(1000).optional(),
  wipeRate: z.number().int().min(1).max(1000).optional(),
  fadeToBlackRate: z.number().int().min(1).max(1000).optional(),
  downstreamKeyers: z.array(dskStateSchema).optional(),
  upstreamKeyers: z.array(uskStateSchema).optional(),
  auxOutputs: z.array(auxStateSchema).optional(),
}).passthrough();

const macroBaseSchema = z.object({
  duration: z.number().int().min(0).max(600000).optional(),
}).passthrough();

export const macroStepSchema = z.discriminatedUnion("type", [
  macroBaseSchema.extend({
    type: z.literal("recall_preset"),
    cameraId: z.number().int().positive(),
    presetNumber: z.number().int().min(0).max(255),
  }),
  macroBaseSchema.extend({
    type: z.literal("pan_tilt"),
    cameraId: z.number().int().positive(),
    pan: z.number().min(-1).max(1),
    tilt: z.number().min(-1).max(1),
    speed: z.number().min(0).max(1).optional(),
  }),
  macroBaseSchema.extend({
    type: z.literal("pan_tilt_stop"),
    cameraId: z.number().int().positive(),
  }),
  macroBaseSchema.extend({
    type: z.literal("zoom"),
    cameraId: z.number().int().positive(),
    direction: z.number().min(-1).max(1),
    speed: z.number().min(0).max(1).optional(),
  }),
  macroBaseSchema.extend({
    type: z.literal("focus_auto"),
    cameraId: z.number().int().positive(),
  }),
  macroBaseSchema.extend({ type: z.literal("atem_cut") }),
  macroBaseSchema.extend({ type: z.literal("atem_auto") }),
  macroBaseSchema.extend({
    type: z.literal("atem_program"),
    inputId: z.number().int().min(0).max(100000),
  }),
  macroBaseSchema.extend({
    type: z.literal("atem_preview"),
    inputId: z.number().int().min(0).max(100000),
  }),
  macroBaseSchema.extend({
    type: z.literal("delay"),
    duration: z.number().int().min(1).max(600000),
  }),
  macroBaseSchema.extend({
    type: z.literal("hue_scene"),
    bridgeId: z.number().int().positive(),
    sceneId: z.string().min(1),
    groupId: z.string().min(1).optional(),
  }),
  macroBaseSchema.extend({
    type: z.literal("hue_group"),
    bridgeId: z.number().int().positive(),
    groupId: z.string().min(1),
    on: z.boolean().optional(),
    brightness: z.number().int().min(0).max(254).optional(),
    colorTemp: z.number().int().min(150).max(500).optional(),
  }),
  macroBaseSchema.extend({
    type: z.literal("hue_light"),
    bridgeId: z.number().int().positive(),
    lightId: z.string().min(1),
    on: z.boolean().optional(),
    brightness: z.number().int().min(0).max(254).optional(),
    colorTemp: z.number().int().min(150).max(500).optional(),
  }),
  macroBaseSchema.extend({
    type: z.literal("display_command"),
    displayId: z.number().int().positive(),
    command: displayCommandSchema.default("power_on"),
    value: optionalValueSchema,
    capability: z.string().optional(),
    smartthingsCommand: z.string().optional(),
    arguments: z.array(z.unknown()).optional(),
  }),
]);

export type MixerActionValue = z.infer<typeof mixerActionSchema>;
export type HueActionValue = z.infer<typeof hueActionSchema>;
export type DisplayActionValue = z.infer<typeof displayActionSchema>;
export type SceneAtemStateValue = z.infer<typeof sceneAtemStateSchema>;
export type MacroStepValue = z.infer<typeof macroStepSchema>;

type VersionedActions<T> = { version: typeof AUTOMATION_SCHEMA_VERSION; actions: T[] };
type VersionedObject<T> = { version: typeof AUTOMATION_SCHEMA_VERSION; state: T };
type VersionedSteps<T> = { version: typeof AUTOMATION_SCHEMA_VERSION; steps: T[] };

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function parseVersionedActionArray<T>(value: string | null | undefined, itemSchema: z.ZodType<T>): T[] | null {
  const parsed = parseJson(value);
  if (parsed === null) return [];
  if (parsed === undefined) return null;

  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as VersionedActions<unknown>).actions)
      ? (parsed as VersionedActions<unknown>).actions
      : null;

  if (!candidate) return null;
  const result = z.array(itemSchema).safeParse(candidate);
  return result.success ? result.data : null;
}

export function stringifyVersionedActionArray<T>(actions: T[]) {
  return JSON.stringify({ version: AUTOMATION_SCHEMA_VERSION, actions });
}

export function parseVersionedObject<T>(value: string | null | undefined, schema: z.ZodType<T>): T | null {
  const parsed = parseJson(value);
  if (parsed === null) return null;
  if (parsed === undefined) return null;

  const candidate = parsed && typeof parsed === "object" && "state" in parsed
    ? (parsed as VersionedObject<unknown>).state
    : parsed;

  const result = schema.safeParse(candidate);
  return result.success ? result.data : null;
}

export function stringifyVersionedObject<T>(state: T) {
  return JSON.stringify({ version: AUTOMATION_SCHEMA_VERSION, state });
}

export function parseMacroSteps(value: string | null | undefined): MacroStepValue[] | null {
  const parsed = parseJson(value);
  if (parsed === null) return [];
  if (parsed === undefined) return null;

  const candidate = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as VersionedSteps<unknown>).steps)
      ? (parsed as VersionedSteps<unknown>).steps
      : null;

  if (!candidate) return null;
  const result = z.array(macroStepSchema).safeParse(candidate);
  return result.success ? result.data : null;
}

export function stringifyMacroSteps(steps: MacroStepValue[]) {
  return JSON.stringify({ version: AUTOMATION_SCHEMA_VERSION, steps });
}
