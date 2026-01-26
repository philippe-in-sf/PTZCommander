import { cameras, presets, mixers, switchers, type Camera, type InsertCamera, type Preset, type InsertPreset, type Mixer, type InsertMixer, type Switcher, type InsertSwitcher } from "@shared/schema";
import { db } from "./db";
import { pool } from "./db";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Camera operations
  getAllCameras(): Promise<Camera[]>;
  getCamera(id: number): Promise<Camera | undefined>;
  getCameraByIp(ip: string): Promise<Camera | undefined>;
  createCamera(camera: InsertCamera): Promise<Camera>;
  updateCamera(id: number, updates: Partial<Camera>): Promise<Camera | undefined>;
  deleteCamera(id: number): Promise<void>;
  updateCameraStatus(id: number, status: string): Promise<void>;
  setProgramCamera(id: number): Promise<void>;
  setPreviewCamera(id: number): Promise<void>;

  // Preset operations
  getPresetsForCamera(cameraId: number): Promise<Preset[]>;
  getPreset(cameraId: number, presetNumber: number): Promise<Preset | undefined>;
  savePreset(preset: InsertPreset): Promise<Preset>;
  deletePreset(id: number): Promise<void>;

  // Mixer operations
  getAllMixers(): Promise<Mixer[]>;
  getMixer(id: number): Promise<Mixer | undefined>;
  createMixer(mixer: InsertMixer): Promise<Mixer>;
  updateMixer(id: number, updates: Partial<Mixer>): Promise<Mixer | undefined>;
  deleteMixer(id: number): Promise<void>;
  updateMixerStatus(id: number, status: string): Promise<void>;

  // Switcher operations
  getAllSwitchers(): Promise<Switcher[]>;
  getSwitcher(id: number): Promise<Switcher | undefined>;
  createSwitcher(switcher: InsertSwitcher): Promise<Switcher>;
  updateSwitcher(id: number, updates: Partial<Switcher>): Promise<Switcher | undefined>;
  deleteSwitcher(id: number): Promise<void>;
  updateSwitcherStatus(id: number, status: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Camera operations
  async getAllCameras(): Promise<Camera[]> {
    return await db.select().from(cameras);
  }

  async getCamera(id: number): Promise<Camera | undefined> {
    const [camera] = await db.select().from(cameras).where(eq(cameras.id, id));
    return camera || undefined;
  }

  async getCameraByIp(ip: string): Promise<Camera | undefined> {
    const [camera] = await db.select().from(cameras).where(eq(cameras.ip, ip));
    return camera || undefined;
  }

  async createCamera(insertCamera: InsertCamera): Promise<Camera> {
    const [camera] = await db.insert(cameras).values(insertCamera).returning();
    return camera;
  }

  async updateCamera(id: number, updates: Partial<Camera>): Promise<Camera | undefined> {
    const [camera] = await db
      .update(cameras)
      .set(updates)
      .where(eq(cameras.id, id))
      .returning();
    return camera || undefined;
  }

  async deleteCamera(id: number): Promise<void> {
    await db.delete(cameras).where(eq(cameras.id, id));
  }

  async updateCameraStatus(id: number, status: string): Promise<void> {
    await db.update(cameras).set({ status }).where(eq(cameras.id, id));
  }

  async setProgramCamera(id: number): Promise<void> {
    // Use transaction to atomically clear and set program flag
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE cameras SET is_program_output = false');
      await client.query('UPDATE cameras SET is_program_output = true WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setPreviewCamera(id: number): Promise<void> {
    // Use transaction to atomically clear and set preview flag
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE cameras SET is_preview_output = false');
      await client.query('UPDATE cameras SET is_preview_output = true WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Preset operations
  async getPresetsForCamera(cameraId: number): Promise<Preset[]> {
    return await db.select().from(presets).where(eq(presets.cameraId, cameraId));
  }

  async getPreset(cameraId: number, presetNumber: number): Promise<Preset | undefined> {
    const [preset] = await db
      .select()
      .from(presets)
      .where(and(eq(presets.cameraId, cameraId), eq(presets.presetNumber, presetNumber)));
    return preset || undefined;
  }

  async savePreset(insertPreset: InsertPreset): Promise<Preset> {
    // Check if preset already exists
    const existing = await this.getPreset(insertPreset.cameraId, insertPreset.presetNumber);
    
    if (existing) {
      // Update existing preset
      const [updated] = await db
        .update(presets)
        .set({ ...insertPreset, updatedAt: new Date() })
        .where(eq(presets.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new preset
      const [preset] = await db.insert(presets).values(insertPreset).returning();
      return preset;
    }
  }

  async deletePreset(id: number): Promise<void> {
    await db.delete(presets).where(eq(presets.id, id));
  }

  // Mixer operations
  async getAllMixers(): Promise<Mixer[]> {
    return await db.select().from(mixers);
  }

  async getMixer(id: number): Promise<Mixer | undefined> {
    const [mixer] = await db.select().from(mixers).where(eq(mixers.id, id));
    return mixer || undefined;
  }

  async createMixer(insertMixer: InsertMixer): Promise<Mixer> {
    const [mixer] = await db.insert(mixers).values(insertMixer).returning();
    return mixer;
  }

  async updateMixer(id: number, updates: Partial<Mixer>): Promise<Mixer | undefined> {
    const [mixer] = await db
      .update(mixers)
      .set(updates)
      .where(eq(mixers.id, id))
      .returning();
    return mixer || undefined;
  }

  async deleteMixer(id: number): Promise<void> {
    await db.delete(mixers).where(eq(mixers.id, id));
  }

  async updateMixerStatus(id: number, status: string): Promise<void> {
    await db.update(mixers).set({ status }).where(eq(mixers.id, id));
  }

  // Switcher operations
  async getAllSwitchers(): Promise<Switcher[]> {
    return await db.select().from(switchers);
  }

  async getSwitcher(id: number): Promise<Switcher | undefined> {
    const [switcher] = await db.select().from(switchers).where(eq(switchers.id, id));
    return switcher || undefined;
  }

  async createSwitcher(insertSwitcher: InsertSwitcher): Promise<Switcher> {
    const [switcher] = await db.insert(switchers).values(insertSwitcher).returning();
    return switcher;
  }

  async updateSwitcher(id: number, updates: Partial<Switcher>): Promise<Switcher | undefined> {
    const [switcher] = await db
      .update(switchers)
      .set(updates)
      .where(eq(switchers.id, id))
      .returning();
    return switcher || undefined;
  }

  async deleteSwitcher(id: number): Promise<void> {
    await db.delete(switchers).where(eq(switchers.id, id));
  }

  async updateSwitcherStatus(id: number, status: string): Promise<void> {
    await db.update(switchers).set({ status }).where(eq(switchers.id, id));
  }
}

export const storage = new DatabaseStorage();
