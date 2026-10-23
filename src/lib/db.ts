import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { seedDatabase } from "./seed";

type Db = Database.Database;

const MIGRATIONS: string[] = [
  `
  CREATE TABLE voice_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    abbr TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE singers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    nickname TEXT NOT NULL,
    voice_group_id INTEGER NOT NULL REFERENCES voice_groups(id) ON DELETE RESTRICT,
    height INTEGER NOT NULL DEFAULT 170,
    is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE venues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    width_m REAL NOT NULL,
    depth_m REAL NOT NULL
  );
  CREATE TABLE concerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT,
    venue_id INTEGER REFERENCES venues(id) ON DELETE SET NULL,
    stage_width REAL NOT NULL,
    stage_depth REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE concert_attendance (
    concert_id INTEGER NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    singer_id INTEGER NOT NULL REFERENCES singers(id) ON DELETE CASCADE,
    attending INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (concert_id, singer_id)
  );
  CREATE TABLE scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    concert_id INTEGER NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    settings TEXT NOT NULL,
    placements TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_scenes_concert ON scenes(concert_id, position);
  CREATE TABLE templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    settings TEXT NOT NULL,
    placements TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  ALTER TABLE voice_groups ADD COLUMN category TEXT;
  `,
];

function migrate(db: Db) {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

const globalForDb = globalThis as unknown as { __mixupDb?: Db };

export function openDb(file: string): Db {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function dbPath(): string {
  return process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "mixup.db");
}

export function getDb(): Db {
  if (!globalForDb.__mixupDb) {
    const db = openDb(dbPath());
    globalForDb.__mixupDb = db;
    const count = db.prepare("SELECT COUNT(*) AS n FROM voice_groups").get() as { n: number };
    if (count.n === 0 && process.env.SEED_ON_EMPTY !== "false") {
      seedDatabase(db);
    }
  }
  return globalForDb.__mixupDb;
}
