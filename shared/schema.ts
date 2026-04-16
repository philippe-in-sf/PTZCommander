import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const cameras = pgTable("cameras", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull().unique(),
  port: integer("port").notNull().default(52381),
  protocol: text("protocol").notNull().default("visca"),
  username: text("username"),
  password: text("password"),
  streamUrl: text("stream_url"),
  atemInputId: integer("atem_input_id"),
  tallyState: text("tally_state").notNull().default("off"),
  status: text("status").notNull().default("offline"),
  isProgramOutput: boolean("is_program_output").notNull().default(false),
  isPreviewOutput: boolean("is_preview_output").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const presets = pgTable("presets", {
  id: serial("id").primaryKey(),
  cameraId: integer("camera_id").notNull().references(() => cameras.id, { onDelete: "cascade" }),
  presetNumber: integer("preset_number").notNull(),
  name: text("name"),
  thumbnail: text("thumbnail"),
  pan: integer("pan"),
  tilt: integer("tilt"),
  zoom: integer("zoom"),
  focus: integer("focus"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("presets_camera_id_idx").on(table.cameraId),
]);

export const mixers = pgTable("mixers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull().unique(),
  port: integer("port").notNull().default(10023),
  status: text("status").notNull().default("offline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const switchers = pgTable("switchers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull().unique(),
  type: text("type").notNull().default("atem"),
  status: text("status").notNull().default("offline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sceneButtons = pgTable("scene_buttons", {
  id: serial("id").primaryKey(),
  buttonNumber: integer("button_number").notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#06b6d4"),
  groupName: text("group_name").default("General"),
  atemInputId: integer("atem_input_id"),
  atemTransitionType: text("atem_transition_type").default("cut"),
  cameraId: integer("camera_id").references(() => cameras.id, { onDelete: "set null" }),
  presetNumber: integer("preset_number"),
  mixerActions: text("mixer_actions"),
  hueActions: text("hue_actions"),
  displayActions: text("display_actions"),
}, (table) => [
  index("scene_buttons_camera_id_idx").on(table.cameraId),
]);

export const layouts = pgTable("layouts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#06b6d4"),
  snapshot: text("snapshot").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const macros = pgTable("macros", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  notes: text("notes"),
  color: text("color").notNull().default("#06b6d4"),
  steps: text("steps").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const hueBridges = pgTable("hue_bridges", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  apiKey: text("api_key"),
  status: text("status").notNull().default("offline"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const displayDevices = pgTable("display_devices", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull().default("samsung_frame"),
  ip: text("ip"),
  protocol: text("protocol").notNull().default("smartthings"),
  smartthingsDeviceId: text("smartthings_device_id"),
  smartthingsToken: text("smartthings_token"),
  smartthingsRefreshToken: text("smartthings_refresh_token"),
  smartthingsTokenExpiresAt: timestamp("smartthings_token_expires_at"),
  smartthingsClientId: text("smartthings_client_id"),
  smartthingsClientSecret: text("smartthings_client_secret"),
  status: text("status").notNull().default("offline"),
  powerState: text("power_state"),
  volume: integer("volume"),
  muted: boolean("muted").notNull().default(false),
  inputSource: text("input_source"),
  artModeStatus: text("art_mode_status"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  level: text("level").notNull(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  action: text("action"),
  details: text("details"),
  userId: text("user_id"),
});

export const insertCameraSchema = createInsertSchema(cameras).omit({
  id: true,
  createdAt: true,
  status: true,
  tallyState: true,
  isProgramOutput: true,
  isPreviewOutput: true,
});

export const insertPresetSchema = createInsertSchema(presets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMixerSchema = createInsertSchema(mixers).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertSwitcherSchema = createInsertSchema(switchers).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertSceneButtonSchema = createInsertSchema(sceneButtons).omit({
  id: true,
});

export const insertLayoutSchema = createInsertSchema(layouts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  isActive: true,
});

export const insertMacroSchema = createInsertSchema(macros).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHueBridgeSchema = createInsertSchema(hueBridges).omit({
  id: true,
  createdAt: true,
  status: true,
});

export const insertDisplayDeviceSchema = createInsertSchema(displayDevices).omit({
  id: true,
  createdAt: true,
  status: true,
  powerState: true,
  volume: true,
  muted: true,
  inputSource: true,
  artModeStatus: true,
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
});

export const patchCameraSchema = insertCameraSchema.partial();
export const patchPresetSchema = createInsertSchema(presets).omit({ id: true, createdAt: true, updatedAt: true, cameraId: true, presetNumber: true }).partial();
export const patchSceneButtonSchema = insertSceneButtonSchema.partial();
export const patchLayoutSchema = insertLayoutSchema.partial();
export const patchMacroSchema = insertMacroSchema.partial();
export const patchHueBridgeSchema = insertHueBridgeSchema.partial();
export const patchDisplayDeviceSchema = createInsertSchema(displayDevices).omit({ id: true, createdAt: true }).partial();
export const patchMixerSchema = insertMixerSchema.partial();
export const patchSwitcherSchema = insertSwitcherSchema.partial();

export type Camera = typeof cameras.$inferSelect;
export type InsertCamera = z.infer<typeof insertCameraSchema>;
export type Preset = typeof presets.$inferSelect;
export type InsertPreset = z.infer<typeof insertPresetSchema>;
export type Mixer = typeof mixers.$inferSelect;
export type InsertMixer = z.infer<typeof insertMixerSchema>;
export type Switcher = typeof switchers.$inferSelect;
export type InsertSwitcher = z.infer<typeof insertSwitcherSchema>;
export type SceneButton = typeof sceneButtons.$inferSelect;
export type InsertSceneButton = z.infer<typeof insertSceneButtonSchema>;
export type Layout = typeof layouts.$inferSelect;
export type InsertLayout = z.infer<typeof insertLayoutSchema>;
export type Macro = typeof macros.$inferSelect;
export type InsertMacro = z.infer<typeof insertMacroSchema>;
export type HueBridge = typeof hueBridges.$inferSelect;
export type InsertHueBridge = z.infer<typeof insertHueBridgeSchema>;
export type DisplayDevice = typeof displayDevices.$inferSelect;
export type InsertDisplayDevice = z.infer<typeof insertDisplayDeviceSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
