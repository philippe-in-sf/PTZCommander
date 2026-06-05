import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import * as schema from "@shared/schema";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import pg from "pg";

const { Pool } = pg;

const useSqlite = !process.env.DATABASE_URL;

let db: any;
let pool: any = null;
let sqlite: any = null;

function runOptionalSqliteMigration(statement: string, label: string) {
  try {
    sqlite.exec(statement);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/duplicate column name|already exists/i.test(message)) return;
    console.warn(`[Database] Skipped optional SQLite migration (${label}): ${message}`);
  }
}

function runOptionalPostgresMigration(statement: string, label: string) {
  pool.query(statement).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Database] Skipped optional PostgreSQL migration (${label}): ${message}`);
  });
}

if (useSqlite) {
  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), "data", "ptzcommand.db");
  const dbDir = dirname(dbPath);
  
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL UNIQUE,
      port INTEGER NOT NULL DEFAULT 52381,
      protocol TEXT NOT NULL DEFAULT 'visca',
      username TEXT,
      password TEXT,
      stream_url TEXT,
      preview_type TEXT NOT NULL DEFAULT 'snapshot',
      preview_refresh_ms INTEGER NOT NULL DEFAULT 2000,
      atem_input_id INTEGER,
      tally_state TEXT NOT NULL DEFAULT 'off',
      status TEXT NOT NULL DEFAULT 'offline',
      is_program_output INTEGER NOT NULL DEFAULT 0,
      is_preview_output INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id INTEGER NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
      preset_number INTEGER NOT NULL,
      name TEXT,
      thumbnail TEXT,
      pan INTEGER,
      tilt INTEGER,
      zoom INTEGER,
      focus INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS mixers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL UNIQUE,
      port INTEGER NOT NULL DEFAULT 10023,
      status TEXT NOT NULL DEFAULT 'offline',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS switchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'atem',
      status TEXT NOT NULL DEFAULT 'offline',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS scene_buttons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      button_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#06b6d4',
      group_name TEXT DEFAULT 'General',
      atem_input_id INTEGER,
      atem_state TEXT,
      atem_transition_type TEXT DEFAULT 'cut',
      obs_scene_name TEXT,
      camera_id INTEGER,
      preset_number INTEGER,
      mixer_actions TEXT,
      hue_actions TEXT,
      display_actions TEXT
    );

    CREATE TABLE IF NOT EXISTS layouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#06b6d4',
      snapshot TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS macros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      notes TEXT,
      color TEXT NOT NULL DEFAULT '#06b6d4',
      steps TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS obs_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 4455,
      password TEXT,
      status TEXT NOT NULL DEFAULT 'offline',
      current_program_scene TEXT,
      studio_mode INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS runsheet_cues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scene_button_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      level TEXT NOT NULL,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      action TEXT,
      details TEXT,
      user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS hue_bridges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL,
      api_key TEXT,
      status TEXT NOT NULL DEFAULT 'offline',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS display_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT 'samsung_frame',
      ip TEXT,
      protocol TEXT NOT NULL DEFAULT 'smartthings',
      smartthings_device_id TEXT,
      smartthings_token TEXT,
      smartthings_refresh_token TEXT,
      smartthings_token_expires_at TEXT,
      smartthings_client_id TEXT,
      smartthings_client_secret TEXT,
      samsung_token TEXT,
      samsung_port INTEGER DEFAULT 8002,
      samsung_model TEXT,
      hisense_port INTEGER DEFAULT 36669,
      hisense_use_ssl INTEGER NOT NULL DEFAULT 1,
      hisense_username TEXT DEFAULT 'hisenseservice',
      hisense_password TEXT DEFAULT 'multimqttservice',
      hisense_client_name TEXT DEFAULT 'PTZCommander',
      hisense_model TEXT,
      hisense_paired INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'offline',
      power_state TEXT,
      volume INTEGER,
      muted INTEGER NOT NULL DEFAULT 0,
      input_source TEXT,
      art_mode_status TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  for (const [label, statement] of [
    ["users username", "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"],
    ["presets camera id", "CREATE INDEX IF NOT EXISTS idx_presets_camera_id ON presets(camera_id)"],
    ["presets camera/number unique", "CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_camera_preset_unique ON presets(camera_id, preset_number)"],
    ["scene button camera id", "CREATE INDEX IF NOT EXISTS idx_scene_buttons_camera_id ON scene_buttons(camera_id)"],
    ["scene button number unique", "CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_buttons_button_number_unique ON scene_buttons(button_number)"],
    ["runsheet cue scene button", "CREATE INDEX IF NOT EXISTS idx_runsheet_cues_scene_button_id ON runsheet_cues(scene_button_id)"],
    ["active layout unique", "CREATE UNIQUE INDEX IF NOT EXISTS idx_layouts_single_active ON layouts(is_active) WHERE is_active = 1"],
    ["audit category timestamp", "CREATE INDEX IF NOT EXISTS idx_audit_logs_category_timestamp ON audit_logs(category, timestamp)"],
    ["hue bridge ip unique", "CREATE UNIQUE INDEX IF NOT EXISTS idx_hue_bridges_ip_unique ON hue_bridges(ip)"],
    ["single mixer connection", "CREATE UNIQUE INDEX IF NOT EXISTS idx_mixers_single_connection ON mixers((1))"],
    ["single switcher connection", "CREATE UNIQUE INDEX IF NOT EXISTS idx_switchers_single_connection ON switchers((1))"],
    ["single obs connection", "CREATE UNIQUE INDEX IF NOT EXISTS idx_obs_connections_single_connection ON obs_connections((1))"],
  ] as const) {
    runOptionalSqliteMigration(statement, label);
  }

  // Migrate existing scene_buttons table to add hue_actions column if missing
  runOptionalSqliteMigration("ALTER TABLE scene_buttons ADD COLUMN hue_actions TEXT", "scene_buttons.hue_actions");
  runOptionalSqliteMigration("ALTER TABLE scene_buttons ADD COLUMN group_name TEXT DEFAULT 'General'", "scene_buttons.group_name");
  runOptionalSqliteMigration("ALTER TABLE scene_buttons ADD COLUMN display_actions TEXT", "scene_buttons.display_actions");
  runOptionalSqliteMigration("ALTER TABLE scene_buttons ADD COLUMN obs_scene_name TEXT", "scene_buttons.obs_scene_name");
  runOptionalSqliteMigration("ALTER TABLE scene_buttons ADD COLUMN atem_state TEXT", "scene_buttons.atem_state");

  for (const statement of [
    "ALTER TABLE cameras ADD COLUMN preview_type TEXT NOT NULL DEFAULT 'snapshot'",
    "ALTER TABLE cameras ADD COLUMN preview_refresh_ms INTEGER NOT NULL DEFAULT 2000",
  ]) {
    runOptionalSqliteMigration(statement, statement);
  }
  runOptionalSqliteMigration("UPDATE cameras SET preview_type = 'none' WHERE (stream_url IS NULL OR stream_url = '') AND preview_type = 'snapshot'", "camera preview default cleanup");

  for (const statement of [
    "ALTER TABLE display_devices ADD COLUMN smartthings_refresh_token TEXT",
    "ALTER TABLE display_devices ADD COLUMN smartthings_token_expires_at TEXT",
    "ALTER TABLE display_devices ADD COLUMN smartthings_client_id TEXT",
    "ALTER TABLE display_devices ADD COLUMN smartthings_client_secret TEXT",
    "ALTER TABLE display_devices ADD COLUMN samsung_token TEXT",
    "ALTER TABLE display_devices ADD COLUMN samsung_port INTEGER DEFAULT 8002",
    "ALTER TABLE display_devices ADD COLUMN samsung_model TEXT",
    "ALTER TABLE display_devices ADD COLUMN hisense_port INTEGER DEFAULT 36669",
    "ALTER TABLE display_devices ADD COLUMN hisense_use_ssl INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE display_devices ADD COLUMN hisense_username TEXT DEFAULT 'hisenseservice'",
    "ALTER TABLE display_devices ADD COLUMN hisense_password TEXT DEFAULT 'multimqttservice'",
    "ALTER TABLE display_devices ADD COLUMN hisense_client_name TEXT DEFAULT 'PTZCommander'",
    "ALTER TABLE display_devices ADD COLUMN hisense_model TEXT",
    "ALTER TABLE display_devices ADD COLUMN hisense_paired INTEGER NOT NULL DEFAULT 0",
  ]) {
    runOptionalSqliteMigration(statement, statement);
  }
  
  db = drizzleSqlite(sqlite, { schema });
  console.log("[Database] Using SQLite database at:", dbPath);
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg(pool, { schema });
  console.log("[Database] Using PostgreSQL database");

  for (const [label, statement] of [
    ["users username", "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"],
    ["presets camera id", "CREATE INDEX IF NOT EXISTS idx_presets_camera_id ON presets(camera_id)"],
    ["presets camera/number unique", "CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_camera_preset_unique ON presets(camera_id, preset_number)"],
    ["scene button camera id", "CREATE INDEX IF NOT EXISTS idx_scene_buttons_camera_id ON scene_buttons(camera_id)"],
    ["scene button number unique", "CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_buttons_button_number_unique ON scene_buttons(button_number)"],
    ["active layout unique", "CREATE UNIQUE INDEX IF NOT EXISTS idx_layouts_single_active ON layouts(is_active) WHERE is_active = true"],
    ["audit category timestamp", "CREATE INDEX IF NOT EXISTS idx_audit_logs_category_timestamp ON audit_logs(category, timestamp)"],
    ["hue bridge ip unique", "CREATE UNIQUE INDEX IF NOT EXISTS idx_hue_bridges_ip_unique ON hue_bridges(ip)"],
    ["single mixer connection", "CREATE UNIQUE INDEX IF NOT EXISTS idx_mixers_single_connection ON mixers ((true))"],
    ["single switcher connection", "CREATE UNIQUE INDEX IF NOT EXISTS idx_switchers_single_connection ON switchers ((true))"],
    ["single obs connection", "CREATE UNIQUE INDEX IF NOT EXISTS idx_obs_connections_single_connection ON obs_connections ((true))"],
  ] as const) {
    runOptionalPostgresMigration(statement, label);
  }
}

export { db, pool, sqlite, useSqlite };
