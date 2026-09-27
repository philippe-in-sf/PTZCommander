import { z } from "zod";

const configItemSchema = z.record(z.string(), z.unknown());

export const appConfigExportSchema = z.object({
  type: z.literal("ptz-command-config"),
  version: z.string(),
  exportedAt: z.string(),
  browserSettings: z.record(z.string(), z.string()).optional(),
  data: z.object({
    cameras: z.array(configItemSchema).default([]),
    presets: z.array(configItemSchema).default([]),
    mixers: z.array(configItemSchema).default([]),
    switchers: z.array(configItemSchema).default([]),
    sceneButtons: z.array(configItemSchema).default([]),
    layouts: z.array(configItemSchema).default([]),
    macros: z.array(configItemSchema).default([]),
    obsConnections: z.array(configItemSchema).default([]),
    runsheetCues: z.array(configItemSchema).default([]),
    hueBridges: z.array(configItemSchema).default([]),
    displayDevices: z.array(configItemSchema).default([]),
  }),
});

export type AppConfigExport = z.infer<typeof appConfigExportSchema>;
