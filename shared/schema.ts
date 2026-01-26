import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
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
  pan: integer("pan"),
  tilt: integer("tilt"),
  zoom: integer("zoom"),
  focus: integer("focus"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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

export const insertCameraSchema = createInsertSchema(cameras).omit({
  id: true,
  createdAt: true,
  status: true,
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

export type Camera = typeof cameras.$inferSelect;
export type InsertCamera = z.infer<typeof insertCameraSchema>;
export type Preset = typeof presets.$inferSelect;
export type InsertPreset = z.infer<typeof insertPresetSchema>;
export type Mixer = typeof mixers.$inferSelect;
export type InsertMixer = z.infer<typeof insertMixerSchema>;
export type Switcher = typeof switchers.$inferSelect;
export type InsertSwitcher = z.infer<typeof insertSwitcherSchema>;
