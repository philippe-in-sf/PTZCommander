import { z } from "zod";
import { insertPresetSchema } from "./schema";

const commandIdSchema = z.string().trim().min(1).max(80).optional();
const cameraIdSchema = z.number().int().positive();
const inputIdSchema = z.number().int().min(0).max(100000);
const unitSchema = z.number().min(-1).max(1);
const speedSchema = z.number().min(0).max(1);
const faderSchema = z.number().min(0).max(1);
const rateSchema = z.number().int().min(1).max(1000);
const indexSchema = z.number().int().min(0).max(255);
const mixerSectionSchema = z.enum(["ch", "bus", "auxin", "fxrtn", "mtx", "dca", "main"]);

function command<const Type extends string, T extends z.ZodRawShape>(type: Type, shape: T) {
  return z.object({
    type: z.literal(type),
    commandId: commandIdSchema,
    ...shape,
  }).strict();
}

export const liveWsCommandSchema = z.discriminatedUnion("type", [
  command("pan_tilt", {
    cameraId: cameraIdSchema,
    pan: unitSchema,
    tilt: unitSchema,
    speed: speedSchema.optional(),
  }),
  command("pan_tilt_stop", { cameraId: cameraIdSchema }),
  command("zoom", {
    cameraId: cameraIdSchema,
    zoom: unitSchema,
    speed: speedSchema.optional(),
  }),
  command("focus_auto", { cameraId: cameraIdSchema }),
  command("focus_far", { cameraId: cameraIdSchema, speed: speedSchema.optional() }),
  command("focus_near", { cameraId: cameraIdSchema, speed: speedSchema.optional() }),
  command("focus_stop", { cameraId: cameraIdSchema }),
  command("recall_preset", {
    cameraId: cameraIdSchema,
    presetNumber: z.number().int().min(0).max(255),
  }),
  command("store_preset", {
    requestId: z.string().trim().min(1).max(120).optional(),
    preset: insertPresetSchema,
  }),
  command("mixer_section_fader", {
    section: mixerSectionSchema,
    channel: z.number().int().min(1).max(128),
    value: faderSchema,
  }),
  command("mixer_section_mute", {
    section: mixerSectionSchema,
    channel: z.number().int().min(1).max(128),
    muted: z.boolean(),
  }),
  command("mixer_fader", {
    channel: z.number().int().min(1).max(128),
    value: faderSchema,
  }),
  command("mixer_mute", {
    channel: z.number().int().min(1).max(128),
    muted: z.boolean(),
  }),
  command("mixer_main_fader", { value: faderSchema }),
  command("mixer_main_mute", { muted: z.boolean() }),
  command("mixer_query_section", { section: mixerSectionSchema }),
  command("atem_cut", {}),
  command("atem_auto", {}),
  command("atem_program", { inputId: inputIdSchema }),
  command("atem_preview", { inputId: inputIdSchema }),
  command("atem_ftb", {}),
  command("atem_transition_style", { style: z.number().int().min(0).max(4) }),
  command("atem_transition_preview", { enabled: z.boolean() }),
  command("atem_transition_position", { position: z.number().int().min(0).max(10000) }),
  command("atem_mix_rate", { rate: rateSchema }),
  command("atem_ftb_rate", { rate: rateSchema }),
  command("atem_dsk_on_air", { index: indexSchema, onAir: z.boolean() }),
  command("atem_dsk_tie", { index: indexSchema, tie: z.boolean() }),
  command("atem_dsk_auto", { index: indexSchema }),
  command("atem_dsk_rate", { index: indexSchema, rate: rateSchema }),
  command("atem_usk_on_air", { index: indexSchema, onAir: z.boolean() }),
  command("atem_macro_run", { index: indexSchema }),
  command("atem_macro_stop", {}),
  command("atem_macro_continue", {}),
  command("atem_aux_source", {
    auxIndex: indexSchema,
    sourceId: inputIdSchema,
  }),
  command("obs_program_scene", {
    sceneName: z.string().trim().min(1).max(256),
  }),
]);

export type LiveWsCommand = z.infer<typeof liveWsCommandSchema>;

export function parseLiveWsCommand(value: unknown) {
  return liveWsCommandSchema.safeParse(value);
}

export function describeLiveWsCommandError(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  }).join("; ");
}
