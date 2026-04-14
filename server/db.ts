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

if (useSqlite) {
  const dbPath = process.env.DATABASE_PATH || join(process.cwd(), "data", "ptzcommand.db");
  const dbDir = dirname(dbPath);
  
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  
  sqlite = new Database(dbPath);
  
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS cameras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      ip TEXT NOT NULL UNIQUE,
      port INTEGER NOT NULL DEFAULT 52381,
      protocol TEXT NOT NULL DEFAULT 'visca',
      username TEXT,
      password TEXT,
      stream_url TEXT,
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
      atem_transition_type TEXT DEFAULT 'cut',
      camera_id INTEGER,
      preset_number INTEGER,
      mixer_actions TEXT,
      hue_actions TEXT
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
  `);

  try {
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_presets_camera_id ON presets(camera_id)");
    sqlite.exec("CREATE INDEX IF NOT EXISTS idx_audit_logs_category_timestamp ON audit_logs(category, timestamp)");
  } catch {
  }

  // Migrate existing scene_buttons table to add hue_actions column if missing
  try {
    sqlite.exec("ALTER TABLE scene_buttons ADD COLUMN hue_actions TEXT");
  } catch {
    // Column already exists — ignore
  }

  try {
    sqlite.exec("ALTER TABLE scene_buttons ADD COLUMN group_name TEXT DEFAULT 'General'");
  } catch {
    // Column already exists — ignore
  }
  
  db = drizzleSqlite(sqlite, { schema });
  console.log("[Database] Using SQLite database at:", dbPath);
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg(pool, { schema });
  console.log("[Database] Using PostgreSQL database");

  pool.query("CREATE INDEX IF NOT EXISTS idx_presets_camera_id ON presets(camera_id)").catch(() => {});
  pool.query("CREATE INDEX IF NOT EXISTS idx_audit_logs_category_timestamp ON audit_logs(category, timestamp)").catch(() => {});
}

export { db, pool, sqlite, useSqlite };
