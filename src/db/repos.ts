import type {
  FoodItem,
  Habit,
  HabitLog,
  HabitStatus,
  ISODate,
  MealLog,
  Profile,
  ProgressPhoto,
  Settings,
  StepsEntry,
  SupplementLog,
  WaterLog,
  WeeklySummary,
  WeightEntry,
  XpEvent,
} from '../types';
import { getDb } from './database';
import { newId } from '../logic/ids';
import { SEED_FOODS } from '../data/indianFoods';

const nowIso = () => new Date().toISOString();

/* ---------------- settings ---------------- */

const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  theme: 'system',
  weightUnit: 'kg',
  healthConnectEnabled: false,
  futureLookCloudEnabled: false,
  lastWeeklySummaryFor: null,
  pinnedNotificationEnabled: true,
  installedAt: nowIso(),
};

export const settingsRepo = {
  async get(): Promise<Settings> {
    const db = await getDb();
    const rows = await db.query<{ key: string; value: string }>(`SELECT key, value FROM settings`);
    const out: Settings = { ...DEFAULT_SETTINGS };
    for (const r of rows) {
      if (r.key === 'schema_version') continue;
      if (r.key in out) {
        try {
          (out as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
        } catch {
          /* ignore */
        }
      }
    }
    return out;
  },
  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, JSON.stringify(value)]);
  },
  async update(patch: Partial<Settings>): Promise<void> {
    for (const [k, v] of Object.entries(patch)) await this.set(k as keyof Settings, v as never);
  },
};

/* ---------------- profile ---------------- */

export const profileRepo = {
  async get(): Promise<Profile | null> {
    const db = await getDb();
    const rows = await db.query<{ json: string }>(`SELECT json FROM profile WHERE id = 1`);
    if (!rows.length) return null;
    try {
      return JSON.parse(rows[0].json) as Profile;
    } catch {
      return null;
    }
  },
  async save(profile: Profile): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT OR REPLACE INTO profile (id, json, updated_at) VALUES (1, ?, ?)`, [
      JSON.stringify(profile),
      nowIso(),
    ]);
  },
};

/* ---------------- habits ---------------- */

interface HabitRow {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: string;
  schedule_json: string;
  reminder_time: string | null;
  reminder_enabled: number;
  pinned: number;
  archived: number;
  created_at: string;
  sort_order: number;
  xp: number;
}

function rowToHabit(r: HabitRow): Habit {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    color: r.color,
    kind: r.kind as Habit['kind'],
    schedule: JSON.parse(r.schedule_json),
    reminderTime: r.reminder_time,
    reminderEnabled: !!r.reminder_enabled,
    pinned: !!r.pinned,
    archived: !!r.archived,
    createdAt: r.created_at,
    sortOrder: r.sort_order,
    xp: r.xp,
  };
}

export const habitRepo = {
  async all(includeArchived = false): Promise<Habit[]> {
    const db = await getDb();
    const rows = await db.query<HabitRow>(
      `SELECT * FROM habits ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY sort_order, created_at`,
    );
    return rows.map(rowToHabit);
  },
  async get(id: string): Promise<Habit | null> {
    const db = await getDb();
    const rows = await db.query<HabitRow>(`SELECT * FROM habits WHERE id = ?`, [id]);
    return rows.length ? rowToHabit(rows[0]) : null;
  },
  async upsert(h: Habit): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT OR REPLACE INTO habits (id, name, emoji, color, kind, schedule_json, reminder_time, reminder_enabled, pinned, archived, created_at, sort_order, xp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        h.id,
        h.name,
        h.emoji,
        h.color,
        h.kind,
        JSON.stringify(h.schedule),
        h.reminderTime,
        h.reminderEnabled ? 1 : 0,
        h.pinned ? 1 : 0,
        h.archived ? 1 : 0,
        h.createdAt,
        h.sortOrder,
        h.xp,
      ],
    );
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM habit_logs WHERE habit_id = ?`, [id]);
    await db.run(`DELETE FROM habits WHERE id = ?`, [id]);
  },
  async logsFor(habitId: string, from?: ISODate, to?: ISODate): Promise<HabitLog[]> {
    const db = await getDb();
    const params: unknown[] = [habitId];
    let where = 'habit_id = ?';
    if (from) {
      where += ' AND date >= ?';
      params.push(from);
    }
    if (to) {
      where += ' AND date <= ?';
      params.push(to);
    }
    const rows = await db.query<{ habit_id: string; date: string; status: string; note: string | null; logged_at: string }>(
      `SELECT * FROM habit_logs WHERE ${where} ORDER BY date`,
      params,
    );
    return rows.map((r) => ({
      habitId: r.habit_id,
      date: r.date,
      status: r.status as HabitStatus,
      note: r.note ?? undefined,
      loggedAt: r.logged_at,
    }));
  },
  async logsBetween(from: ISODate, to: ISODate): Promise<HabitLog[]> {
    const db = await getDb();
    const rows = await db.query<{ habit_id: string; date: string; status: string; note: string | null; logged_at: string }>(
      `SELECT * FROM habit_logs WHERE date >= ? AND date <= ? ORDER BY date`,
      [from, to],
    );
    return rows.map((r) => ({
      habitId: r.habit_id,
      date: r.date,
      status: r.status as HabitStatus,
      note: r.note ?? undefined,
      loggedAt: r.logged_at,
    }));
  },
  async allLogs(): Promise<HabitLog[]> {
    const db = await getDb();
    const rows = await db.query<{ habit_id: string; date: string; status: string; note: string | null; logged_at: string }>(
      `SELECT * FROM habit_logs ORDER BY date`,
    );
    return rows.map((r) => ({
      habitId: r.habit_id,
      date: r.date,
      status: r.status as HabitStatus,
      note: r.note ?? undefined,
      loggedAt: r.logged_at,
    }));
  },
  async setLog(habitId: string, date: ISODate, status: HabitStatus | null, note?: string): Promise<void> {
    const db = await getDb();
    if (status === null) {
      await db.run(`DELETE FROM habit_logs WHERE habit_id = ? AND date = ?`, [habitId, date]);
      return;
    }
    await db.run(
      `INSERT OR REPLACE INTO habit_logs (habit_id, date, status, note, logged_at) VALUES (?, ?, ?, ?, ?)`,
      [habitId, date, status, note ?? null, nowIso()],
    );
  },
};

/* ---------------- supplements (definitions live in profile; logs here) ---------------- */

export const supplementRepo = {
  async logsOn(date: ISODate): Promise<SupplementLog[]> {
    const db = await getDb();
    const rows = await db.query<{ supplement_id: string; date: string; taken_at: string }>(
      `SELECT * FROM supplement_logs WHERE date = ?`,
      [date],
    );
    return rows.map((r) => ({ supplementId: r.supplement_id, date: r.date, takenAt: r.taken_at }));
  },
  async logsFor(supplementId: string): Promise<SupplementLog[]> {
    const db = await getDb();
    const rows = await db.query<{ supplement_id: string; date: string; taken_at: string }>(
      `SELECT * FROM supplement_logs WHERE supplement_id = ? ORDER BY date`,
      [supplementId],
    );
    return rows.map((r) => ({ supplementId: r.supplement_id, date: r.date, takenAt: r.taken_at }));
  },
  async setTaken(supplementId: string, date: ISODate, taken: boolean): Promise<void> {
    const db = await getDb();
    if (!taken) {
      await db.run(`DELETE FROM supplement_logs WHERE supplement_id = ? AND date = ?`, [supplementId, date]);
      return;
    }
    await db.run(`INSERT OR REPLACE INTO supplement_logs (supplement_id, date, taken_at) VALUES (?, ?, ?)`, [
      supplementId,
      date,
      nowIso(),
    ]);
  },
};

/* ---------------- water ---------------- */

export const waterRepo = {
  async totalOn(date: ISODate): Promise<number> {
    const db = await getDb();
    const rows = await db.query<{ total: number | null }>(`SELECT SUM(ml) as total FROM water_logs WHERE date = ?`, [date]);
    return rows[0]?.total ?? 0;
  },
  async add(date: ISODate, ml: number): Promise<WaterLog> {
    const db = await getDb();
    const log: WaterLog = { id: newId('wat'), date, ml, loggedAt: nowIso() };
    await db.run(`INSERT INTO water_logs (id, date, ml, logged_at) VALUES (?, ?, ?, ?)`, [log.id, date, ml, log.loggedAt]);
    return log;
  },
  async undoLast(date: ISODate): Promise<void> {
    const db = await getDb();
    const rows = await db.query<{ id: string }>(`SELECT id FROM water_logs WHERE date = ? ORDER BY logged_at DESC LIMIT 1`, [date]);
    if (rows.length) await db.run(`DELETE FROM water_logs WHERE id = ?`, [rows[0].id]);
  },
  async dailyTotals(from: ISODate, to: ISODate): Promise<Map<ISODate, number>> {
    const db = await getDb();
    const rows = await db.query<{ date: string; total: number }>(
      `SELECT date, SUM(ml) as total FROM water_logs WHERE date >= ? AND date <= ? GROUP BY date`,
      [from, to],
    );
    return new Map(rows.map((r) => [r.date, r.total]));
  },
};

/* ---------------- weight ---------------- */

export const weightRepo = {
  async all(): Promise<WeightEntry[]> {
    const db = await getDb();
    const rows = await db.query<{ id: string; date: string; kg: number; logged_at: string }>(
      `SELECT * FROM weight_entries ORDER BY date, logged_at`,
    );
    return rows.map((r) => ({ id: r.id, date: r.date, kg: r.kg, loggedAt: r.logged_at }));
  },
  async latest(): Promise<WeightEntry | null> {
    const db = await getDb();
    const rows = await db.query<{ id: string; date: string; kg: number; logged_at: string }>(
      `SELECT * FROM weight_entries ORDER BY date DESC, logged_at DESC LIMIT 1`,
    );
    return rows.length ? { id: rows[0].id, date: rows[0].date, kg: rows[0].kg, loggedAt: rows[0].logged_at } : null;
  },
  async add(date: ISODate, kg: number): Promise<WeightEntry> {
    const db = await getDb();
    const e: WeightEntry = { id: newId('wt'), date, kg: Math.round(kg * 100) / 100, loggedAt: nowIso() };
    await db.run(`INSERT INTO weight_entries (id, date, kg, logged_at) VALUES (?, ?, ?, ?)`, [e.id, e.date, e.kg, e.loggedAt]);
    return e;
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM weight_entries WHERE id = ?`, [id]);
  },
};

/* ---------------- foods & meals ---------------- */

interface FoodRow {
  id: string;
  name: string;
  name_local: string | null;
  category: string;
  serving_label: string;
  serving_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  vegetarian: number;
  custom: number;
}

function rowToFood(r: FoodRow): FoodItem {
  return {
    id: r.id,
    name: r.name,
    nameLocal: r.name_local ?? undefined,
    category: r.category,
    servingLabel: r.serving_label,
    servingGrams: r.serving_grams,
    kcal: r.kcal,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    vegetarian: !!r.vegetarian,
    custom: !!r.custom,
  };
}

export const foodRepo = {
  async seedIfEmpty(): Promise<void> {
    const db = await getDb();
    const rows = await db.query<{ n: number }>(`SELECT COUNT(*) as n FROM foods`);
    if ((rows[0]?.n ?? 0) > 0) return;
    for (const f of SEED_FOODS) await this.upsert(f);
  },
  async all(): Promise<FoodItem[]> {
    const db = await getDb();
    const rows = await db.query<FoodRow>(`SELECT * FROM foods ORDER BY custom DESC, category, name`);
    return rows.map(rowToFood);
  },
  async upsert(f: FoodItem): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT OR REPLACE INTO foods (id, name, name_local, category, serving_label, serving_grams, kcal, protein_g, carbs_g, fat_g, vegetarian, custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.id,
        f.name,
        f.nameLocal ?? null,
        f.category,
        f.servingLabel,
        f.servingGrams,
        f.kcal,
        f.proteinG,
        f.carbsG,
        f.fatG,
        f.vegetarian ? 1 : 0,
        f.custom ? 1 : 0,
      ],
    );
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM foods WHERE id = ? AND custom = 1`, [id]);
  },
};

interface MealRow {
  id: string;
  date: string;
  time: string;
  food_id: string;
  food_name: string;
  servings: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  outside_window: number;
  logged_at: string;
}

function rowToMeal(r: MealRow): MealLog {
  return {
    id: r.id,
    date: r.date,
    time: r.time,
    foodId: r.food_id,
    foodName: r.food_name,
    servings: r.servings,
    kcal: r.kcal,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    outsideFastingWindow: !!r.outside_window,
    loggedAt: r.logged_at,
  };
}

export const mealRepo = {
  async on(date: ISODate): Promise<MealLog[]> {
    const db = await getDb();
    const rows = await db.query<MealRow>(`SELECT * FROM meal_logs WHERE date = ? ORDER BY time`, [date]);
    return rows.map(rowToMeal);
  },
  async between(from: ISODate, to: ISODate): Promise<MealLog[]> {
    const db = await getDb();
    const rows = await db.query<MealRow>(`SELECT * FROM meal_logs WHERE date >= ? AND date <= ? ORDER BY date, time`, [from, to]);
    return rows.map(rowToMeal);
  },
  async add(m: Omit<MealLog, 'id' | 'loggedAt'>): Promise<MealLog> {
    const db = await getDb();
    const log: MealLog = { ...m, id: newId('meal'), loggedAt: nowIso() };
    await db.run(
      `INSERT INTO meal_logs (id, date, time, food_id, food_name, servings, kcal, protein_g, carbs_g, fat_g, outside_window, logged_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        log.id,
        log.date,
        log.time,
        log.foodId,
        log.foodName,
        log.servings,
        log.kcal,
        log.proteinG,
        log.carbsG,
        log.fatG,
        log.outsideFastingWindow ? 1 : 0,
        log.loggedAt,
      ],
    );
    return log;
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM meal_logs WHERE id = ?`, [id]);
  },
};

/* ---------------- photos ---------------- */

export const photoRepo = {
  async all(): Promise<ProgressPhoto[]> {
    const db = await getDb();
    const rows = await db.query<{ id: string; date: string; storage_key: string; weight_kg: number | null; note: string; created_at: string }>(
      `SELECT * FROM photos ORDER BY date, created_at`,
    );
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      storageKey: r.storage_key,
      weightKg: r.weight_kg,
      note: r.note,
      createdAt: r.created_at,
    }));
  },
  async add(p: Omit<ProgressPhoto, 'id' | 'createdAt'>): Promise<ProgressPhoto> {
    const db = await getDb();
    const photo: ProgressPhoto = { ...p, id: newId('ph'), createdAt: nowIso() };
    await db.run(`INSERT INTO photos (id, date, storage_key, weight_kg, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`, [
      photo.id,
      photo.date,
      photo.storageKey,
      photo.weightKg,
      photo.note,
      photo.createdAt,
    ]);
    return photo;
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM photos WHERE id = ?`, [id]);
  },
};

/* ---------------- steps ---------------- */

export const stepsRepo = {
  async on(date: ISODate): Promise<StepsEntry | null> {
    const db = await getDb();
    const rows = await db.query<{ date: string; steps: number; source: string; updated_at: string }>(
      `SELECT * FROM steps WHERE date = ?`,
      [date],
    );
    return rows.length
      ? { date: rows[0].date, steps: rows[0].steps, source: rows[0].source as StepsEntry['source'], updatedAt: rows[0].updated_at }
      : null;
  },
  async set(date: ISODate, steps: number, source: StepsEntry['source']): Promise<void> {
    const db = await getDb();
    await db.run(`INSERT OR REPLACE INTO steps (date, steps, source, updated_at) VALUES (?, ?, ?, ?)`, [date, steps, source, nowIso()]);
  },
  async between(from: ISODate, to: ISODate): Promise<StepsEntry[]> {
    const db = await getDb();
    const rows = await db.query<{ date: string; steps: number; source: string; updated_at: string }>(
      `SELECT * FROM steps WHERE date >= ? AND date <= ? ORDER BY date`,
      [from, to],
    );
    return rows.map((r) => ({ date: r.date, steps: r.steps, source: r.source as StepsEntry['source'], updatedAt: r.updated_at }));
  },
};

/* ---------------- weekly summaries ---------------- */

export const summaryRepo = {
  async all(): Promise<WeeklySummary[]> {
    const db = await getDb();
    const rows = await db.query<Record<string, unknown>>(`SELECT * FROM weekly_summaries ORDER BY week_start`);
    return rows.map((r) => ({
      weekStart: r.week_start as string,
      weekEnd: r.week_end as string,
      habitsPct: r.habits_pct as number,
      avgWaterMl: r.avg_water_ml as number,
      workoutsDone: r.workouts_done as number,
      weightDeltaKg: (r.weight_delta_kg as number | null) ?? null,
      avgKcal: (r.avg_kcal as number | null) ?? null,
      avgProteinG: (r.avg_protein_g as number | null) ?? null,
      xpEarned: (r.xp_earned as number) ?? 0,
      generatedAt: r.generated_at as string,
    }));
  },
  async upsert(s: WeeklySummary): Promise<void> {
    const db = await getDb();
    await db.run(
      `INSERT OR REPLACE INTO weekly_summaries (week_start, week_end, habits_pct, avg_water_ml, workouts_done, weight_delta_kg, avg_kcal, avg_protein_g, xp_earned, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.weekStart, s.weekEnd, s.habitsPct, s.avgWaterMl, s.workoutsDone, s.weightDeltaKg, s.avgKcal, s.avgProteinG, s.xpEarned, s.generatedAt],
    );
  },
};

/* ---------------- xp ---------------- */

export const xpRepo = {
  async total(): Promise<number> {
    const db = await getDb();
    const rows = await db.query<{ total: number | null }>(`SELECT SUM(amount) as total FROM xp_events`);
    return rows[0]?.total ?? 0;
  },
  async totalOn(date: ISODate): Promise<number> {
    const db = await getDb();
    const rows = await db.query<{ total: number | null }>(`SELECT SUM(amount) as total FROM xp_events WHERE date = ?`, [date]);
    return rows[0]?.total ?? 0;
  },
  async totalBetween(from: ISODate, to: ISODate): Promise<number> {
    const db = await getDb();
    const rows = await db.query<{ total: number | null }>(
      `SELECT SUM(amount) as total FROM xp_events WHERE date >= ? AND date <= ?`,
      [from, to],
    );
    return rows[0]?.total ?? 0;
  },
  async add(date: ISODate, amount: number, reason: string): Promise<XpEvent> {
    const db = await getDb();
    const ev: XpEvent = { id: newId('xp'), date, amount, reason, loggedAt: nowIso() };
    await db.run(`INSERT INTO xp_events (id, date, amount, reason, logged_at) VALUES (?, ?, ?, ?, ?)`, [
      ev.id,
      ev.date,
      ev.amount,
      ev.reason,
      ev.loggedAt,
    ]);
    return ev;
  },
  /** Remove XP previously granted for a reason on a date (used when un-ticking). */
  async revoke(date: ISODate, reason: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM xp_events WHERE date = ? AND reason = ?`, [date, reason]);
  },
};
