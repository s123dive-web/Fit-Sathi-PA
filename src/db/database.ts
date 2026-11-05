import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS } from './migrations';

const DB_NAME = 'fitsaathi';

export interface Db {
  run(sql: string, params?: unknown[]): Promise<void>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string): Promise<void>;
  /** Flush to persistent store (web only; no-op on native). */
  persist(): Promise<void>;
  exportAll(): Promise<Record<string, Record<string, unknown>[]>>;
  importAll(dump: Record<string, Record<string, unknown>[]>): Promise<void>;
  wipe(): Promise<void>;
  schemaVersion(): Promise<number>;
  /**
   * Run `fn` inside BEGIN/COMMIT (ROLLBACK on throw). Transactions are serialised through a mutex so two
   * concurrent callers cannot interleave their statements. Nested calls join the outer transaction.
   */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/** Settings keys that a restore must never overwrite (app-lock state). Mirrors backup.ts LOCK_SETTINGS_KEYS. */
const PROTECTED_SETTINGS_KEYS = new Set(['pinHash', 'pinSalt', 'appLockEnabled', 'biometricEnabled', 'failedAttempts', 'lockoutUntil', 'lastFailedAt']);

export const TABLES = [
  'settings',
  'profile',
  'habits',
  'habit_logs',
  'supplements',
  'supplement_logs',
  'water_logs',
  'weight_logs',
  'food_items',
  'meal_logs',
  'photos',
  'alarms',
  'notification_log',
  'steps',
  'points_ledger',
  'weekly_summaries',
] as const;

export type TableName = (typeof TABLES)[number];

let dbPromise: Promise<Db> | null = null;

class SqliteDb implements Db {
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private txChain: Promise<unknown> = Promise.resolve();
  private txDepth = 0;

  constructor(
    private conn: SQLiteDBConnection,
    private sqlite: SQLiteConnection,
    private isWeb: boolean,
  ) {}

  private scheduleSave() {
    if (!this.isWeb) return;
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.persist(), 120);
  }

  /** Flush pending web writes when the page is hidden / unloaded. */
  installFlushHooks(): void {
    if (!this.isWeb || typeof window === 'undefined') return;
    const flush = () => {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      void this.persist();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
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

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.txDepth > 0) return fn(); // nested: join the outer transaction
    const run = async (): Promise<T> => {
      this.txDepth += 1;
      await this.conn.execute('BEGIN', false);
      try {
        const out = await fn();
        await this.conn.execute('COMMIT', false);
        this.scheduleSave();
        return out;
      } catch (e) {
        await this.conn.execute('ROLLBACK', false).catch(() => undefined);
        throw e;
      } finally {
        this.txDepth -= 1;
      }
    };
    const next = this.txChain.then(run, run);
    this.txChain = next.catch(() => undefined);
    return next;
  }

  async schemaVersion(): Promise<number> {
    const rows = await this.query<{ v: number | null }>(`SELECT MAX(version) as v FROM schema_migrations`);
    return rows[0]?.v ?? 0;
  }

  async exportAll(): Promise<Record<string, Record<string, unknown>[]>> {
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const t of TABLES) out[t] = await this.query(`SELECT * FROM ${t}`);
    return out;
  }

  async importAll(dump: Record<string, Record<string, unknown>[]>): Promise<void> {
    await this.transaction(async () => {
      for (const t of TABLES) {
        if (t === 'settings') {
          // Keep the device's lock state; replace everything else.
          const keep = [...PROTECTED_SETTINGS_KEYS];
          await this.conn.run(`DELETE FROM settings WHERE key NOT IN (${keep.map(() => '?').join(',')})`, keep as never[], false);
        } else {
          await this.conn.run(`DELETE FROM ${t}`, [], false);
        }
        for (const row of dump[t] ?? []) {
          if (t === 'settings' && PROTECTED_SETTINGS_KEYS.has(String(row.key))) continue;
          const cols = Object.keys(row).filter((c) => /^[a-z_]+$/.test(c));
          if (!cols.length) continue;
          await this.conn.run(
            `INSERT OR REPLACE INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
            cols.map((c) => row[c]) as never[],
            false,
          );
        }
      }
    });
  }

  async wipe(): Promise<void> {
    for (const t of TABLES) await this.conn.run(`DELETE FROM ${t}`, [], false);
    this.scheduleSave();
    await this.persist();
  }
}

async function migrate(conn: SQLiteDBConnection): Promise<void> {
  await conn.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`, false);
  const applied = new Set(((await conn.query(`SELECT version FROM schema_migrations`)).values ?? []).map((r) => (r as { version: number }).version));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    await conn.execute(m.sql, false);
    await conn.run(`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`, [m.version, m.name, new Date().toISOString()], false);
  }
}

/**
 * At-rest encryption (Android): the database is a SQLCipher file. The passphrase is a random 256-bit value generated
 * once on this device and kept by the plugin in EncryptedSharedPreferences (Android Keystore backed); it never leaves
 * the device and is not part of backups. A database created by an older, unencrypted build is converted in place on
 * first open (mode "encryption"), afterwards it is opened with mode "secret".
 */
async function nativeEncryptionMode(sqlite: SQLiteConnection): Promise<'secret' | 'encryption'> {
  if (!(await sqlite.isSecretStored()).result) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await sqlite.setEncryptionSecret(secret);
  }
  const exists = (await sqlite.isDatabase(DB_NAME)).result;
  if (!exists) return 'secret';
  const encrypted = (await sqlite.isDatabaseEncrypted(DB_NAME)).result;
  return encrypted ? 'secret' : 'encryption';
}

async function openDb(): Promise<Db> {
  const isWeb = Capacitor.getPlatform() === 'web';
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
  let conn: SQLiteDBConnection;
  if (consistency.result && isConn) {
    conn = await sqlite.retrieveConnection(DB_NAME, false);
  } else if (isWeb) {
    conn = await sqlite.createConnection(DB_NAME, false, 'no-encryption', CURRENT_SCHEMA_VERSION, false);
  } else {
    conn = await sqlite.createConnection(DB_NAME, true, await nativeEncryptionMode(sqlite), CURRENT_SCHEMA_VERSION, false);
  }
  await conn.open();
  await migrate(conn);
  const db = new SqliteDb(conn, sqlite, isWeb);
  db.installFlushHooks();
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
