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
      atem_input_id INTEGER,
      atem_transition_type TEXT DEFAULT 'cut',
      camera_id INTEGER,
      preset_number INTEGER,
      mixer_actions TEXT
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
  `);
  
  db = drizzleSqlite(sqlite, { schema });
  console.log("[Database] Using SQLite database at:", dbPath);
} else {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzlePg(pool, { schema });
  console.log("[Database] Using PostgreSQL database");
}

export { db, pool, sqlite, useSqlite };
