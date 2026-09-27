import { z } from "zod";

export const liveAppStateSchema = z.object({
  selectedCameraId: z.number().int().positive().nullable().default(null),
  activeRunsheetCueId: z.number().int().positive().nullable().default(null),
});

export const patchLiveAppStateSchema = liveAppStateSchema.partial().strict();

export type LiveAppState = z.infer<typeof liveAppStateSchema>;
