import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'fitsaathi';
const SCHEMA_VERSION = 1;

export interface Db {
  run(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string): Promise<void>;
  /** Flush to persistent store (web only; no-op on native). */
  persist(): Promise<void>;
  exportAll(): Promise<Record<string, Record<string, unknown>[]>>;
  importAll(dump: Record<string, Record<string, unknown>[]>): Promise<void>;
  wipe(): Promise<void>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL, color TEXT NOT NULL, kind TEXT NOT NULL,
  schedule_json TEXT NOT NULL, reminder_time TEXT, reminder_enabled INTEGER NOT NULL DEFAULT 0,
  pinned INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 10
);
CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, note TEXT, logged_at TEXT NOT NULL,
  PRIMARY KEY (habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(date);
CREATE TABLE IF NOT EXISTS supplement_logs (
  supplement_id TEXT NOT NULL, date TEXT NOT NULL, taken_at TEXT NOT NULL, PRIMARY KEY (supplement_id, date)
);
CREATE TABLE IF NOT EXISTS water_logs (id TEXT PRIMARY KEY, date TEXT NOT NULL, ml INTEGER NOT NULL, logged_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_water_date ON water_logs(date);
CREATE TABLE IF NOT EXISTS weight_entries (id TEXT PRIMARY KEY, date TEXT NOT NULL, kg REAL NOT NULL, logged_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_weight_date ON weight_entries(date);
CREATE TABLE IF NOT EXISTS foods (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_local TEXT, category TEXT NOT NULL, serving_label TEXT NOT NULL,
  serving_grams REAL NOT NULL, kcal REAL NOT NULL, protein_g REAL NOT NULL, carbs_g REAL NOT NULL, fat_g REAL NOT NULL,
  vegetarian INTEGER NOT NULL DEFAULT 1, custom INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS meal_logs (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL, food_id TEXT NOT NULL, food_name TEXT NOT NULL,
  servings REAL NOT NULL, kcal REAL NOT NULL, protein_g REAL NOT NULL, carbs_g REAL NOT NULL, fat_g REAL NOT NULL,
  outside_window INTEGER NOT NULL DEFAULT 0, logged_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meal_date ON meal_logs(date);
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, storage_key TEXT NOT NULL, weight_kg REAL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS steps (date TEXT PRIMARY KEY, steps INTEGER NOT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS weekly_summaries (
  week_start TEXT PRIMARY KEY, week_end TEXT NOT NULL, habits_pct REAL NOT NULL, avg_water_ml REAL NOT NULL,
  workouts_done INTEGER NOT NULL, weight_delta_kg REAL, avg_kcal REAL, avg_protein_g REAL, xp_earned INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS xp_events (id TEXT PRIMARY KEY, date TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, logged_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_xp_date ON xp_events(date);
`;

export const TABLES = [
  'settings',
  'profile',
  'habits',
  'habit_logs',
  'supplement_logs',
  'water_logs',
  'weight_entries',
  'foods',
  'meal_logs',
  'photos',
  'steps',
  'weekly_summaries',
  'xp_events',
] as const;

let dbPromise: Promise<Db> | null = null;

class SqliteDb implements Db {
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private conn: SQLiteDBConnection,
    private sqlite: SQLiteConnection,
    private isWeb: boolean,
  ) {}

  private scheduleSave() {
    if (!this.isWeb) return;
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.persist(), 400);
  }

  async run(sql: string, params: unknown[] = []): Promise<void> {
    await this.conn.run(sql, params as never[], false);
    this.scheduleSave();
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const res = await this.conn.query(sql, params as never[]);
    return (res.values ?? []) as T[];
  }

  async execute(sql: string): Promise<void> {
    await this.conn.execute(sql, false);
    this.scheduleSave();
  }

  async persist(): Promise<void> {
    if (!this.isWeb || !this.dirty) return;
    this.dirty = false;
    try {
      await this.sqlite.saveToStore(DB_NAME);
    } catch (e) {
      console.warn('saveToStore failed', e);
    }
  }

  async exportAll(): Promise<Record<string, Record<string, unknown>[]>> {
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const t of TABLES) out[t] = await this.query(`SELECT * FROM ${t}`);
    return out;
  }

  async importAll(dump: Record<string, Record<string, unknown>[]>): Promise<void> {
    await this.execute('BEGIN');
    try {
      for (const t of TABLES) {
        await this.conn.run(`DELETE FROM ${t}`, [], false);
        const rows = dump[t] ?? [];
        for (const row of rows) {
          const cols = Object.keys(row);
          if (!cols.length) continue;
          const placeholders = cols.map(() => '?').join(',');
          await this.conn.run(
            `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${placeholders})`,
            cols.map((c) => row[c]) as never[],
            false,
          );
        }
      }
      await this.execute('COMMIT');
    } catch (e) {
      await this.execute('ROLLBACK');
      throw e;
    }
    this.scheduleSave();
  }

  async wipe(): Promise<void> {
    for (const t of TABLES) await this.conn.run(`DELETE FROM ${t}`, [], false);
    this.scheduleSave();
    await this.persist();
  }
}

async function openDb(): Promise<Db> {
  const platform = Capacitor.getPlatform();
  const isWeb = platform === 'web';
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  if (isWeb) {
    if (!document.querySelector('jeep-sqlite')) {
      const el = document.createElement('jeep-sqlite');
      el.setAttribute('wasmPath', 'assets');
      document.body.appendChild(el);
    }
    await customElements.whenDefined('jeep-sqlite');
    await sqlite.initWebStore();
  }

  const consistency = await sqlite.checkConnectionsConsistency();
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;
  const conn =
    consistency.result && isConn
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', SCHEMA_VERSION, false);
  await conn.open();
  await conn.execute(SCHEMA, false);
  const db = new SqliteDb(conn, sqlite, isWeb);
  await db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('schema_version', ?)`, [String(SCHEMA_VERSION)]);
  await db.persist();
  return db;
}

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = openDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}
