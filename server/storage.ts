import { cameras, presets, mixers, switchers, sceneButtons, layouts, macros, auditLogs, hueBridges, type Camera, type InsertCamera, type Preset, type InsertPreset, type Mixer, type InsertMixer, type Switcher, type InsertSwitcher, type SceneButton, type InsertSceneButton, type Layout, type InsertLayout, type Macro, type InsertMacro, type AuditLog, type InsertAuditLog, type HueBridge, type InsertHueBridge } from "@shared/schema";
import { desc, eq, and } from "drizzle-orm";
import { db, sqlite, useSqlite } from "./db";

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
  getPresetById(id: number): Promise<Preset | undefined>;
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

  // Scene button operations
  getAllSceneButtons(): Promise<SceneButton[]>;
  getSceneButton(id: number): Promise<SceneButton | undefined>;
  createSceneButton(button: InsertSceneButton): Promise<SceneButton>;
  updateSceneButton(id: number, updates: Partial<SceneButton>): Promise<SceneButton | undefined>;
  deleteSceneButton(id: number): Promise<void>;

  // Layout operations
  getAllLayouts(): Promise<Layout[]>;
  getLayout(id: number): Promise<Layout | undefined>;
  createLayout(layout: InsertLayout): Promise<Layout>;
  updateLayout(id: number, updates: Partial<Layout>): Promise<Layout | undefined>;
  deleteLayout(id: number): Promise<void>;
  setActiveLayout(id: number): Promise<void>;
  getActiveLayout(): Promise<Layout | undefined>;

  // Macro operations
  getAllMacros(): Promise<Macro[]>;
  getMacro(id: number): Promise<Macro | undefined>;
  createMacro(macro: InsertMacro): Promise<Macro>;
  updateMacro(id: number, updates: Partial<Macro>): Promise<Macro | undefined>;
  deleteMacro(id: number): Promise<void>;

  // Hue bridge operations
  getAllHueBridges(): Promise<HueBridge[]>;
  getHueBridge(id: number): Promise<HueBridge | undefined>;
  createHueBridge(bridge: InsertHueBridge): Promise<HueBridge>;
  updateHueBridge(id: number, updates: Partial<HueBridge>): Promise<HueBridge | undefined>;
  deleteHueBridge(id: number): Promise<void>;

  // Audit log operations
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number, category?: string): Promise<AuditLog[]>;
}

function sqliteRowToCamera(row: any): Camera {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    port: row.port,
    protocol: row.protocol,
    username: row.username,
    password: row.password,
    streamUrl: row.stream_url,
    atemInputId: row.atem_input_id,
    tallyState: row.tally_state || 'off',
    status: row.status,
    isProgramOutput: Boolean(row.is_program_output),
    isPreviewOutput: Boolean(row.is_preview_output),
    createdAt: new Date(row.created_at),
  };
}

function sqliteRowToPreset(row: any): Preset {
  return {
    id: row.id,
    cameraId: row.camera_id,
    presetNumber: row.preset_number,
    name: row.name,
    thumbnail: row.thumbnail,
    pan: row.pan,
    tilt: row.tilt,
    zoom: row.zoom,
    focus: row.focus,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function sqliteRowToMixer(row: any): Mixer {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    port: row.port,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

function sqliteRowToSwitcher(row: any): Switcher {
  return {
    id: row.id,
    name: row.name,
    ip: row.ip,
    type: row.type,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

function sqliteRowToMacro(row: any): Macro {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    notes: row.notes,
    color: row.color,
    steps: row.steps,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function sqliteRowToSceneButton(row: any): SceneButton {
  return {
    id: row.id,
    buttonNumber: row.button_number,
    name: row.name,
    color: row.color,
    groupName: row.group_name || "General",
    atemInputId: row.atem_input_id,
    atemTransitionType: row.atem_transition_type,
    cameraId: row.camera_id,
    presetNumber: row.preset_number,
    mixerActions: row.mixer_actions,
    hueActions: row.hue_actions,
  };
}

function sqliteRowToLayout(row: any): Layout {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    snapshot: row.snapshot,
    isActive: Boolean(row.is_active),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function sqliteRowToAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    timestamp: new Date(row.timestamp),
    level: row.level,
    category: row.category,
    message: row.message,
    action: row.action,
    details: row.details,
    userId: row.user_id,
  };
}

export class DatabaseStorage implements IStorage {
  // Camera operations
  async getAllCameras(): Promise<Camera[]> {
    if (useSqlite && sqlite) {
      const rows = sqlite.prepare('SELECT * FROM cameras').all();
      return rows.map(sqliteRowToCamera);
    }
    return await db.select().from(cameras);
  }

  async getCamera(id: number): Promise<Camera | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM cameras WHERE id = ?').get(id);
      return row ? sqliteRowToCamera(row) : undefined;
    }
    const [camera] = await db.select().from(cameras).where(eq(cameras.id, id));
    return camera || undefined;
  }

  async getCameraByIp(ip: string): Promise<Camera | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM cameras WHERE ip = ?').get(ip);
      return row ? sqliteRowToCamera(row) : undefined;
    }
    const [camera] = await db.select().from(cameras).where(eq(cameras.ip, ip));
    return camera || undefined;
  }

  async createCamera(insertCamera: InsertCamera): Promise<Camera> {
    if (useSqlite && sqlite) {
      const stmt = sqlite.prepare(`
        INSERT INTO cameras (name, ip, port, protocol, username, password, stream_url, atem_input_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        insertCamera.name,
        insertCamera.ip,
        insertCamera.port || 52381,
        insertCamera.protocol || 'visca',
        insertCamera.username || null,
        insertCamera.password || null,
        insertCamera.streamUrl || null,
        insertCamera.atemInputId || null
      );
      return this.getCamera(Number(result.lastInsertRowid)) as Promise<Camera>;
    }
    const [camera] = await db.insert(cameras).values(insertCamera).returning();
    return camera;
  }

  async updateCamera(id: number, updates: Partial<Camera>): Promise<Camera | undefined> {
    if (useSqlite && sqlite) {
      const setClauses: string[] = [];
      const values: any[] = [];
      
      if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
      if (updates.ip !== undefined) { setClauses.push('ip = ?'); values.push(updates.ip); }
      if (updates.port !== undefined) { setClauses.push('port = ?'); values.push(updates.port); }
      if (updates.protocol !== undefined) { setClauses.push('protocol = ?'); values.push(updates.protocol); }
      if (updates.username !== undefined) { setClauses.push('username = ?'); values.push(updates.username); }
      if (updates.password !== undefined) { setClauses.push('password = ?'); values.push(updates.password); }
      if (updates.streamUrl !== undefined) { setClauses.push('stream_url = ?'); values.push(updates.streamUrl); }
      if (updates.atemInputId !== undefined) { setClauses.push('atem_input_id = ?'); values.push(updates.atemInputId); }
      if (updates.tallyState !== undefined) { setClauses.push('tally_state = ?'); values.push(updates.tallyState); }
      if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
      if (updates.isProgramOutput !== undefined) { setClauses.push('is_program_output = ?'); values.push(updates.isProgramOutput ? 1 : 0); }
      if (updates.isPreviewOutput !== undefined) { setClauses.push('is_preview_output = ?'); values.push(updates.isPreviewOutput ? 1 : 0); }
      
      if (setClauses.length === 0) return this.getCamera(id);
      
      values.push(id);
      sqlite.prepare(`UPDATE cameras SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      return this.getCamera(id);
    }
    const [camera] = await db
      .update(cameras)
      .set(updates)
      .where(eq(cameras.id, id))
      .returning();
    return camera || undefined;
  }

  async deleteCamera(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('DELETE FROM cameras WHERE id = ?').run(id);
      return;
    }
    await db.delete(cameras).where(eq(cameras.id, id));
  }

  async updateCameraStatus(id: number, status: string): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('UPDATE cameras SET status = ? WHERE id = ?').run(status, id);
      return;
    }
    await db.update(cameras).set({ status }).where(eq(cameras.id, id));
  }

  async setProgramCamera(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.exec('BEGIN TRANSACTION');
      try {
        sqlite.exec('UPDATE cameras SET is_program_output = 0');
        sqlite.prepare('UPDATE cameras SET is_program_output = 1 WHERE id = ?').run(id);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    } else {
      await db.transaction(async (tx: typeof db) => {
        await tx.update(cameras).set({ isProgramOutput: false });
        await tx.update(cameras).set({ isProgramOutput: true }).where(eq(cameras.id, id));
      });
    }
  }

  async setPreviewCamera(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.exec('BEGIN TRANSACTION');
      try {
        sqlite.exec('UPDATE cameras SET is_preview_output = 0');
        sqlite.prepare('UPDATE cameras SET is_preview_output = 1 WHERE id = ?').run(id);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    } else {
      await db.transaction(async (tx: typeof db) => {
        await tx.update(cameras).set({ isPreviewOutput: false });
        await tx.update(cameras).set({ isPreviewOutput: true }).where(eq(cameras.id, id));
      });
    }
  }

  // Preset operations
  async getPresetsForCamera(cameraId: number): Promise<Preset[]> {
    if (useSqlite && sqlite) {
      const rows = sqlite.prepare('SELECT * FROM presets WHERE camera_id = ?').all(cameraId);
      return rows.map(sqliteRowToPreset);
    }
    return await db.select().from(presets).where(eq(presets.cameraId, cameraId));
  }

  async getPreset(cameraId: number, presetNumber: number): Promise<Preset | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM presets WHERE camera_id = ? AND preset_number = ?').get(cameraId, presetNumber);
      return row ? sqliteRowToPreset(row) : undefined;
    }
    const [preset] = await db
      .select()
      .from(presets)
      .where(and(eq(presets.cameraId, cameraId), eq(presets.presetNumber, presetNumber)));
    return preset || undefined;
  }

  async getPresetById(id: number): Promise<Preset | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM presets WHERE id = ?').get(id);
      return row ? sqliteRowToPreset(row) : undefined;
    }
    const [preset] = await db
      .select()
      .from(presets)
      .where(eq(presets.id, id));
    return preset || undefined;
  }

  async savePreset(insertPreset: InsertPreset): Promise<Preset> {
    if (useSqlite && sqlite) {
      const existing = await this.getPreset(insertPreset.cameraId, insertPreset.presetNumber);
      const now = new Date().toISOString();
      
      if (existing) {
        sqlite.prepare(`
          UPDATE presets SET name = ?, pan = ?, tilt = ?, zoom = ?, focus = ?, updated_at = ?
          WHERE camera_id = ? AND preset_number = ?
        `).run(
          insertPreset.name || null,
          insertPreset.pan || null,
          insertPreset.tilt || null,
          insertPreset.zoom || null,
          insertPreset.focus || null,
          now,
          insertPreset.cameraId,
          insertPreset.presetNumber
        );
        return this.getPreset(insertPreset.cameraId, insertPreset.presetNumber) as Promise<Preset>;
      }
      
      const result = sqlite.prepare(`
        INSERT INTO presets (camera_id, preset_number, name, pan, tilt, zoom, focus)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        insertPreset.cameraId,
        insertPreset.presetNumber,
        insertPreset.name || null,
        insertPreset.pan || null,
        insertPreset.tilt || null,
        insertPreset.zoom || null,
        insertPreset.focus || null
      );
      
      const row = sqlite.prepare('SELECT * FROM presets WHERE id = ?').get(Number(result.lastInsertRowid));
      return sqliteRowToPreset(row);
    }
    
    const existing = await this.getPreset(insertPreset.cameraId, insertPreset.presetNumber);
    if (existing) {
      const [updated] = await db
        .update(presets)
        .set({ ...insertPreset, updatedAt: new Date() })
        .where(and(eq(presets.cameraId, insertPreset.cameraId), eq(presets.presetNumber, insertPreset.presetNumber)))
        .returning();
      return updated;
    }
    const [preset] = await db.insert(presets).values(insertPreset).returning();
    return preset;
  }

  async deletePreset(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('DELETE FROM presets WHERE id = ?').run(id);
      return;
    }
    await db.delete(presets).where(eq(presets.id, id));
  }

  // Mixer operations
  async getAllMixers(): Promise<Mixer[]> {
    if (useSqlite && sqlite) {
      const rows = sqlite.prepare('SELECT * FROM mixers').all();
      return rows.map(sqliteRowToMixer);
    }
    return await db.select().from(mixers);
  }

  async getMixer(id: number): Promise<Mixer | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM mixers WHERE id = ?').get(id);
      return row ? sqliteRowToMixer(row) : undefined;
    }
    const [mixer] = await db.select().from(mixers).where(eq(mixers.id, id));
    return mixer || undefined;
  }

  async createMixer(insertMixer: InsertMixer): Promise<Mixer> {
    if (useSqlite && sqlite) {
      const result = sqlite.prepare(`
        INSERT INTO mixers (name, ip, port)
        VALUES (?, ?, ?)
      `).run(
        insertMixer.name,
        insertMixer.ip,
        insertMixer.port || 10023
      );
      return this.getMixer(Number(result.lastInsertRowid)) as Promise<Mixer>;
    }
    const [mixer] = await db.insert(mixers).values(insertMixer).returning();
    return mixer;
  }

  async updateMixer(id: number, updates: Partial<Mixer>): Promise<Mixer | undefined> {
    if (useSqlite && sqlite) {
      const setClauses: string[] = [];
      const values: any[] = [];
      
      if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
      if (updates.ip !== undefined) { setClauses.push('ip = ?'); values.push(updates.ip); }
      if (updates.port !== undefined) { setClauses.push('port = ?'); values.push(updates.port); }
      if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
      
      if (setClauses.length === 0) return this.getMixer(id);
      
      values.push(id);
      sqlite.prepare(`UPDATE mixers SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      return this.getMixer(id);
    }
    const [mixer] = await db
      .update(mixers)
      .set(updates)
      .where(eq(mixers.id, id))
      .returning();
    return mixer || undefined;
  }

  async deleteMixer(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('DELETE FROM mixers WHERE id = ?').run(id);
      return;
    }
    await db.delete(mixers).where(eq(mixers.id, id));
  }

  async updateMixerStatus(id: number, status: string): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('UPDATE mixers SET status = ? WHERE id = ?').run(status, id);
      return;
    }
    await db.update(mixers).set({ status }).where(eq(mixers.id, id));
  }

  // Switcher operations
  async getAllSwitchers(): Promise<Switcher[]> {
    if (useSqlite && sqlite) {
      const rows = sqlite.prepare('SELECT * FROM switchers').all();
      return rows.map(sqliteRowToSwitcher);
    }
    return await db.select().from(switchers);
  }

  async getSwitcher(id: number): Promise<Switcher | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM switchers WHERE id = ?').get(id);
      return row ? sqliteRowToSwitcher(row) : undefined;
    }
    const [switcher] = await db.select().from(switchers).where(eq(switchers.id, id));
    return switcher || undefined;
  }

  async createSwitcher(insertSwitcher: InsertSwitcher): Promise<Switcher> {
    if (useSqlite && sqlite) {
      const result = sqlite.prepare(`
        INSERT INTO switchers (name, ip, type)
        VALUES (?, ?, ?)
      `).run(
        insertSwitcher.name,
        insertSwitcher.ip,
        insertSwitcher.type || 'atem'
      );
      return this.getSwitcher(Number(result.lastInsertRowid)) as Promise<Switcher>;
    }
    const [switcher] = await db.insert(switchers).values(insertSwitcher).returning();
    return switcher;
  }

  async updateSwitcher(id: number, updates: Partial<Switcher>): Promise<Switcher | undefined> {
    if (useSqlite && sqlite) {
      const setClauses: string[] = [];
      const values: any[] = [];
      
      if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
      if (updates.ip !== undefined) { setClauses.push('ip = ?'); values.push(updates.ip); }
      if (updates.type !== undefined) { setClauses.push('type = ?'); values.push(updates.type); }
      if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
      
      if (setClauses.length === 0) return this.getSwitcher(id);
      
      values.push(id);
      sqlite.prepare(`UPDATE switchers SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      return this.getSwitcher(id);
    }
    const [switcher] = await db
      .update(switchers)
      .set(updates)
      .where(eq(switchers.id, id))
      .returning();
    return switcher || undefined;
  }

  async deleteSwitcher(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('DELETE FROM switchers WHERE id = ?').run(id);
      return;
    }
    await db.delete(switchers).where(eq(switchers.id, id));
  }

  async updateSwitcherStatus(id: number, status: string): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('UPDATE switchers SET status = ? WHERE id = ?').run(status, id);
      return;
    }
    await db.update(switchers).set({ status }).where(eq(switchers.id, id));
  }

  // Scene button operations
  async getAllSceneButtons(): Promise<SceneButton[]> {
    if (useSqlite && sqlite) {
      const rows = sqlite.prepare('SELECT * FROM scene_buttons ORDER BY button_number').all();
      return rows.map(sqliteRowToSceneButton);
    }
    return await db.select().from(sceneButtons).orderBy(sceneButtons.buttonNumber);
  }

  async getSceneButton(id: number): Promise<SceneButton | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM scene_buttons WHERE id = ?').get(id);
      return row ? sqliteRowToSceneButton(row) : undefined;
    }
    const [button] = await db.select().from(sceneButtons).where(eq(sceneButtons.id, id));
    return button || undefined;
  }

  async createSceneButton(insert: InsertSceneButton): Promise<SceneButton> {
    if (useSqlite && sqlite) {
      const result = sqlite.prepare(`
        INSERT INTO scene_buttons (button_number, name, color, group_name, atem_input_id, atem_transition_type, camera_id, preset_number, mixer_actions, hue_actions)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        insert.buttonNumber,
        insert.name,
        insert.color || '#06b6d4',
        insert.groupName || 'General',
        insert.atemInputId || null,
        insert.atemTransitionType || 'cut',
        insert.cameraId || null,
        insert.presetNumber || null,
        insert.mixerActions || null,
        insert.hueActions || null
      );
      return this.getSceneButton(Number(result.lastInsertRowid)) as Promise<SceneButton>;
    }
    const [button] = await db.insert(sceneButtons).values(insert).returning();
    return button;
  }

  async updateSceneButton(id: number, updates: Partial<SceneButton>): Promise<SceneButton | undefined> {
    if (useSqlite && sqlite) {
      const setClauses: string[] = [];
      const values: any[] = [];

      if (updates.buttonNumber !== undefined) { setClauses.push('button_number = ?'); values.push(updates.buttonNumber); }
      if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
      if (updates.color !== undefined) { setClauses.push('color = ?'); values.push(updates.color); }
      if (updates.groupName !== undefined) { setClauses.push('group_name = ?'); values.push(updates.groupName || 'General'); }
      if (updates.atemInputId !== undefined) { setClauses.push('atem_input_id = ?'); values.push(updates.atemInputId); }
      if (updates.atemTransitionType !== undefined) { setClauses.push('atem_transition_type = ?'); values.push(updates.atemTransitionType); }
      if (updates.cameraId !== undefined) { setClauses.push('camera_id = ?'); values.push(updates.cameraId); }
      if (updates.presetNumber !== undefined) { setClauses.push('preset_number = ?'); values.push(updates.presetNumber); }
      if (updates.mixerActions !== undefined) { setClauses.push('mixer_actions = ?'); values.push(updates.mixerActions); }
      if (updates.hueActions !== undefined) { setClauses.push('hue_actions = ?'); values.push(updates.hueActions); }

      if (setClauses.length === 0) return this.getSceneButton(id);

      values.push(id);
      sqlite.prepare(`UPDATE scene_buttons SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      return this.getSceneButton(id);
    }
    const [button] = await db
      .update(sceneButtons)
      .set(updates)
      .where(eq(sceneButtons.id, id))
      .returning();
    return button || undefined;
  }

  async deleteSceneButton(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('DELETE FROM scene_buttons WHERE id = ?').run(id);
      return;
    }
    await db.delete(sceneButtons).where(eq(sceneButtons.id, id));
  }

  // Layout operations
  async getAllLayouts(): Promise<Layout[]> {
    if (useSqlite && sqlite) {
      const rows = sqlite.prepare('SELECT * FROM layouts ORDER BY name').all();
      return rows.map(sqliteRowToLayout);
    }
    return await db.select().from(layouts).orderBy(layouts.name);
  }

  async getLayout(id: number): Promise<Layout | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM layouts WHERE id = ?').get(id);
      return row ? sqliteRowToLayout(row) : undefined;
    }
    const [layout] = await db.select().from(layouts).where(eq(layouts.id, id));
    return layout || undefined;
  }

  async createLayout(insert: InsertLayout): Promise<Layout> {
    if (useSqlite && sqlite) {
      const result = sqlite.prepare(`
        INSERT INTO layouts (name, description, color, snapshot, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `).run(
        insert.name,
        insert.description || null,
        insert.color || '#06b6d4',
        insert.snapshot
      );
      return this.getLayout(Number(result.lastInsertRowid)) as Promise<Layout>;
    }
    const [layout] = await db.insert(layouts).values(insert).returning();
    return layout;
  }

  async updateLayout(id: number, updates: Partial<Layout>): Promise<Layout | undefined> {
    if (useSqlite && sqlite) {
      const setClauses: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
      if (updates.color !== undefined) { setClauses.push('color = ?'); values.push(updates.color); }
      if (updates.snapshot !== undefined) { setClauses.push('snapshot = ?'); values.push(updates.snapshot); }
      if (updates.isActive !== undefined) { setClauses.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }

      setClauses.push("updated_at = datetime('now')");

      if (setClauses.length === 0) return this.getLayout(id);

      values.push(id);
      sqlite.prepare(`UPDATE layouts SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      return this.getLayout(id);
    }
    const [layout] = await db
      .update(layouts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(layouts.id, id))
      .returning();
    return layout || undefined;
  }

  async deleteLayout(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('DELETE FROM layouts WHERE id = ?').run(id);
      return;
    }
    await db.delete(layouts).where(eq(layouts.id, id));
  }

  async setActiveLayout(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('UPDATE layouts SET is_active = 0').run();
      sqlite.prepare('UPDATE layouts SET is_active = 1 WHERE id = ?').run(id);
      return;
    }
    await db.update(layouts).set({ isActive: false });
    await db.update(layouts).set({ isActive: true }).where(eq(layouts.id, id));
  }

  async getActiveLayout(): Promise<Layout | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM layouts WHERE is_active = 1').get();
      return row ? sqliteRowToLayout(row) : undefined;
    }
    const [layout] = await db.select().from(layouts).where(eq(layouts.isActive, true));
    return layout || undefined;
  }

  // Macro operations
  async getAllMacros(): Promise<Macro[]> {
    if (useSqlite && sqlite) {
      const rows = sqlite.prepare('SELECT * FROM macros ORDER BY name').all();
      return rows.map(sqliteRowToMacro);
    }
    return await db.select().from(macros).orderBy(macros.name);
  }

  async getMacro(id: number): Promise<Macro | undefined> {
    if (useSqlite && sqlite) {
      const row = sqlite.prepare('SELECT * FROM macros WHERE id = ?').get(id);
      return row ? sqliteRowToMacro(row) : undefined;
    }
    const [macro] = await db.select().from(macros).where(eq(macros.id, id));
    return macro || undefined;
  }

  async createMacro(insert: InsertMacro): Promise<Macro> {
    if (useSqlite && sqlite) {
      const result = sqlite.prepare(`
        INSERT INTO macros (name, description, color, steps, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(
        insert.name,
        insert.description || null,
        insert.color || '#06b6d4',
        insert.steps
      );
      return this.getMacro(Number(result.lastInsertRowid)) as Promise<Macro>;
    }
    const [macro] = await db.insert(macros).values(insert).returning();
    return macro;
  }

  async updateMacro(id: number, updates: Partial<Macro>): Promise<Macro | undefined> {
    if (useSqlite && sqlite) {
      const setClauses: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
      if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
      if (updates.color !== undefined) { setClauses.push('color = ?'); values.push(updates.color); }
      if (updates.steps !== undefined) { setClauses.push('steps = ?'); values.push(updates.steps); }

      setClauses.push("updated_at = datetime('now')");

      if (setClauses.length === 0) return this.getMacro(id);

      values.push(id);
      sqlite.prepare(`UPDATE macros SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
      return this.getMacro(id);
    }
    const [macro] = await db
      .update(macros)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(macros.id, id))
      .returning();
    return macro || undefined;
  }

  async deleteMacro(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('DELETE FROM macros WHERE id = ?').run(id);
      return;
    }
    await db.delete(macros).where(eq(macros.id, id));
  }

  // Audit log operations
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    if (useSqlite && sqlite) {
      const stmt = sqlite.prepare(`
        INSERT INTO audit_logs (timestamp, level, category, message, action, details, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const ts = insertLog.timestamp instanceof Date 
        ? insertLog.timestamp.toISOString() 
        : insertLog.timestamp || new Date().toISOString();
      const result = stmt.run(
        ts,
        insertLog.level,
        insertLog.category,
        insertLog.message,
        insertLog.action || null,
        insertLog.details || null,
        insertLog.userId || null
      );
      return {
        id: Number(result.lastInsertRowid),
        timestamp: new Date(ts),
        level: insertLog.level,
        category: insertLog.category,
        message: insertLog.message,
        action: insertLog.action || null,
        details: insertLog.details || null,
        userId: insertLog.userId || null,
      };
    }
    const [log] = await db.insert(auditLogs).values(insertLog).returning();
    return log;
  }

  async getAuditLogs(limit: number = 100, category?: string): Promise<AuditLog[]> {
    if (useSqlite && sqlite) {
      let query = 'SELECT * FROM audit_logs';
      const params: any[] = [];
      
      if (category) {
        query += ' WHERE category = ?';
        params.push(category);
      }
      query += ' ORDER BY timestamp DESC LIMIT ?';
      params.push(limit);
      
      const rows = sqlite.prepare(query).all(...params);
      return rows.map(sqliteRowToAuditLog);
    }
    
    if (category) {
      return await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.category, category))
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);
    }
    return await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit);
  }

  // ========== Hue Bridge Operations ==========
  async getAllHueBridges(): Promise<HueBridge[]> {
    if (useSqlite && sqlite) {
      const rows = sqlite.prepare('SELECT * FROM hue_bridges ORDER BY id').all();
      return rows.map((r: any) => ({
        id: r.id, name: r.name, ip: r.ip, apiKey: r.api_key,
        status: r.status, createdAt: new Date(r.created_at),
      }));
    }
    return await db.select().from(hueBridges);
  }

  async getHueBridge(id: number): Promise<HueBridge | undefined> {
    if (useSqlite && sqlite) {
      const row: any = sqlite.prepare('SELECT * FROM hue_bridges WHERE id = ?').get(id);
      if (!row) return undefined;
      return { id: row.id, name: row.name, ip: row.ip, apiKey: row.api_key, status: row.status, createdAt: new Date(row.created_at) };
    }
    const [bridge] = await db.select().from(hueBridges).where(eq(hueBridges.id, id));
    return bridge;
  }

  async createHueBridge(bridge: InsertHueBridge): Promise<HueBridge> {
    if (useSqlite && sqlite) {
      const result = sqlite.prepare('INSERT INTO hue_bridges (name, ip, api_key, status, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *')
        .get(bridge.name, bridge.ip, bridge.apiKey ?? null, 'offline', new Date().toISOString()) as any;
      return { id: result.id, name: result.name, ip: result.ip, apiKey: result.api_key, status: result.status, createdAt: new Date(result.created_at) };
    }
    const [created] = await db.insert(hueBridges).values(bridge).returning();
    return created;
  }

  async updateHueBridge(id: number, updates: Partial<HueBridge>): Promise<HueBridge | undefined> {
    if (useSqlite && sqlite) {
      const fields: string[] = [];
      const vals: any[] = [];
      if (updates.name !== undefined) { fields.push('name = ?'); vals.push(updates.name); }
      if (updates.ip !== undefined) { fields.push('ip = ?'); vals.push(updates.ip); }
      if (updates.apiKey !== undefined) { fields.push('api_key = ?'); vals.push(updates.apiKey); }
      if (updates.status !== undefined) { fields.push('status = ?'); vals.push(updates.status); }
      if (!fields.length) return this.getHueBridge(id);
      vals.push(id);
      sqlite.prepare(`UPDATE hue_bridges SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
      return this.getHueBridge(id);
    }
    const [updated] = await db.update(hueBridges).set(updates).where(eq(hueBridges.id, id)).returning();
    return updated;
  }

  async deleteHueBridge(id: number): Promise<void> {
    if (useSqlite && sqlite) {
      sqlite.prepare('DELETE FROM hue_bridges WHERE id = ?').run(id);
      return;
    }
    await db.delete(hueBridges).where(eq(hueBridges.id, id));
  }
}

export const storage = new DatabaseStorage();
