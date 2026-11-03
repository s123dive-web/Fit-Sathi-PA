import type {
  FoodItem,
  Habit,
  HabitLog,
  HabitStatus,
  ISODate,
  MealLog,
  NotificationLogEntry,
  PointsEntry,
  Profile,
  ProgressPhoto,
  Settings,
  StepsEntry,
  Supplement,
  SupplementLog,
  WaterLog,
  WeeklySummary,
  WeightEntry,
} from '../types';
import { getDb } from './database';
import { newId } from '../utils/ids';
import { nowIso } from '../utils/dates';
import { SEED_FOODS } from '../data/indianFoods';
import type { AlarmSpec } from '../native/plugins';

/* ---------------- settings ---------------- */

const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  theme: 'system',
  weightUnit: 'kg',
  heightUnit: 'cm',
  healthConnectEnabled: false,
  lastWeeklySummaryFor: null,
  installedAt: nowIso(),
  appLockEnabled: false,
  pinHash: null,
  pinSalt: null,
  biometricEnabled: false,
  lockTimeoutSec: 60,
  failedAttempts: 0,
  lockoutUntil: null,
};

export const settingsRepo = {
  async get(): Promise<Settings> {
    const db = await getDb();
    const rows = await db.query<{ key: string; value: string }>(`SELECT key, value FROM settings`);
    const out: Settings = { ...DEFAULT_SETTINGS };
    const bag = out as unknown as Record<string, unknown>;
    for (const r of rows) {
      if (!(r.key in out)) continue;
      try {
        bag[r.key] = JSON.parse(r.value);
      } catch {
        /* ignore malformed */
      }
    }
    return out;
  },
  async set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    const db = await getDb();
    const now = nowIso();
    await db.run(
      `INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), now, now],
    );
  },
  async update(patch: Partial<Settings>): Promise<void> {
    for (const [k, v] of Object.entries(patch)) await this.set(k as keyof Settings, v as never);
  },
};

/* ---------------- profile (+ supplements mirror) ---------------- */

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
    const now = nowIso();
    await db.run(
      `INSERT INTO profile (id, json, created_at, updated_at) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
      [JSON.stringify(profile), now, now],
    );
    await supplementRepo.syncFromProfile(profile.supplements);
  },
};

export const supplementRepo = {
  async all(): Promise<Supplement[]> {
    const db = await getDb();
    const rows = await db.query<{ id: string; name: string; dose: string; time: string; alarm: number }>(`SELECT * FROM supplements ORDER BY time`);
    return rows.map((r) => ({ id: r.id, name: r.name, dose: r.dose, time: r.time, alarm: !!r.alarm }));
  },
  async syncFromProfile(supplements: Supplement[]): Promise<void> {
    const db = await getDb();
    const now = nowIso();
    const keep = supplements.map((s) => s.id);
    for (const s of supplements) {
      await db.run(
        `INSERT INTO supplements (id, name, dose, time, alarm, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, dose = excluded.dose, time = excluded.time, alarm = excluded.alarm, updated_at = excluded.updated_at`,
        [s.id, s.name, s.dose, s.time, s.alarm ? 1 : 0, now, now],
      );
    }
    if (keep.length) {
      await db.run(`DELETE FROM supplements WHERE id NOT IN (${keep.map(() => '?').join(',')})`, keep);
    } else {
      await db.run(`DELETE FROM supplements`);
    }
  },
  async logsOn(date: ISODate): Promise<SupplementLog[]> {
    const db = await getDb();
    const rows = await db.query<{ supplement_id: string; date: string; taken_at: string }>(`SELECT * FROM supplement_logs WHERE date = ?`, [date]);
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
    const now = nowIso();
    await db.run(
      `INSERT INTO supplement_logs (supplement_id, date, taken_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(supplement_id, date) DO UPDATE SET taken_at = excluded.taken_at, updated_at = excluded.updated_at`,
      [supplementId, date, now, now, now],
    );
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

interface HabitLogRow {
  habit_id: string;
  date: string;
  status: string;
  note: string | null;
  updated_at: string;
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
    createdAt: r.created_at.slice(0, 10),
    sortOrder: r.sort_order,
    xp: r.xp,
  };
}

function rowToLog(r: HabitLogRow): HabitLog {
  return { habitId: r.habit_id, date: r.date, status: r.status as HabitStatus, note: r.note ?? undefined, loggedAt: r.updated_at };
}

export const habitRepo = {
  async all(includeArchived = false): Promise<Habit[]> {
    const db = await getDb();
    const rows = await db.query<HabitRow>(`SELECT * FROM habits ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY sort_order, created_at`);
    return rows.map(rowToHabit);
  },
  async get(id: string): Promise<Habit | null> {
    const db = await getDb();
    const rows = await db.query<HabitRow>(`SELECT * FROM habits WHERE id = ?`, [id]);
    return rows.length ? rowToHabit(rows[0]) : null;
  },
  async upsert(h: Habit): Promise<void> {
    const db = await getDb();
    const now = nowIso();
    await db.run(
      `INSERT INTO habits (id, name, emoji, color, kind, schedule_json, reminder_time, reminder_enabled, pinned, archived, sort_order, xp, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, emoji = excluded.emoji, color = excluded.color, kind = excluded.kind,
         schedule_json = excluded.schedule_json, reminder_time = excluded.reminder_time, reminder_enabled = excluded.reminder_enabled,
         pinned = excluded.pinned, archived = excluded.archived, sort_order = excluded.sort_order, xp = excluded.xp, updated_at = excluded.updated_at`,
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
        h.sortOrder,
        h.xp,
        h.createdAt,
        now,
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
    return (await db.query<HabitLogRow>(`SELECT * FROM habit_logs WHERE ${where} ORDER BY date`, params)).map(rowToLog);
  },
  async logsBetween(from: ISODate, to: ISODate): Promise<HabitLog[]> {
    const db = await getDb();
    return (await db.query<HabitLogRow>(`SELECT * FROM habit_logs WHERE date >= ? AND date <= ? ORDER BY date`, [from, to])).map(rowToLog);
  },
  async allLogs(): Promise<HabitLog[]> {
    const db = await getDb();
    return (await db.query<HabitLogRow>(`SELECT * FROM habit_logs ORDER BY date`)).map(rowToLog);
  },
  async setLog(habitId: string, date: ISODate, status: HabitStatus | null, note?: string): Promise<void> {
    const db = await getDb();
    if (status === null) {
      await db.run(`DELETE FROM habit_logs WHERE habit_id = ? AND date = ?`, [habitId, date]);
      return;
    }
    const now = nowIso();
    await db.run(
      `INSERT INTO habit_logs (habit_id, date, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(habit_id, date) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
      [habitId, date, status, note ?? null, now, now],
    );
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
    const now = nowIso();
    const log: WaterLog = { id: newId('wat'), date, ml, loggedAt: now };
    await db.run(`INSERT INTO water_logs (id, date, ml, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [log.id, date, ml, now, now]);
    return log;
  },
  async undoLast(date: ISODate): Promise<void> {
    const db = await getDb();
    const rows = await db.query<{ id: string }>(`SELECT id FROM water_logs WHERE date = ? ORDER BY created_at DESC LIMIT 1`, [date]);
    if (rows.length) await db.run(`DELETE FROM water_logs WHERE id = ?`, [rows[0].id]);
  },
  async dailyTotals(from: ISODate, to: ISODate): Promise<Map<ISODate, number>> {
    const db = await getDb();
    const rows = await db.query<{ date: string; total: number }>(`SELECT date, SUM(ml) as total FROM water_logs WHERE date >= ? AND date <= ? GROUP BY date`, [
      from,
      to,
    ]);
    return new Map(rows.map((r) => [r.date, r.total]));
  },
};

/* ---------------- weight ---------------- */

interface WeightRow {
  id: string;
  date: string;
  kg: number;
  created_at: string;
}

export const weightRepo = {
  async all(): Promise<WeightEntry[]> {
    const db = await getDb();
    const rows = await db.query<WeightRow>(`SELECT * FROM weight_logs ORDER BY date, created_at`);
    return rows.map((r) => ({ id: r.id, date: r.date, kg: r.kg, loggedAt: r.created_at }));
  },
  async latest(): Promise<WeightEntry | null> {
    const db = await getDb();
    const rows = await db.query<WeightRow>(`SELECT * FROM weight_logs ORDER BY date DESC, created_at DESC LIMIT 1`);
    return rows.length ? { id: rows[0].id, date: rows[0].date, kg: rows[0].kg, loggedAt: rows[0].created_at } : null;
  },
  async add(date: ISODate, kg: number): Promise<WeightEntry> {
    const db = await getDb();
    const now = nowIso();
    const e: WeightEntry = { id: newId('wt'), date, kg: Math.round(kg * 100) / 100, loggedAt: now };
    await db.run(`INSERT INTO weight_logs (id, date, kg, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`, [e.id, e.date, e.kg, now, now]);
    return e;
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM weight_logs WHERE id = ?`, [id]);
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
    const rows = await db.query<{ n: number }>(`SELECT COUNT(*) as n FROM food_items`);
    if ((rows[0]?.n ?? 0) > 0) return;
    for (const f of SEED_FOODS) await this.upsert(f);
  },
  async all(): Promise<FoodItem[]> {
    const db = await getDb();
    return (await db.query<FoodRow>(`SELECT * FROM food_items ORDER BY custom DESC, category, name`)).map(rowToFood);
  },
  async upsert(f: FoodItem): Promise<void> {
    const db = await getDb();
    const now = nowIso();
    await db.run(
      `INSERT INTO food_items (id, name, name_local, category, serving_label, serving_grams, kcal, protein_g, carbs_g, fat_g, vegetarian, custom, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, name_local = excluded.name_local, category = excluded.category, serving_label = excluded.serving_label,
         serving_grams = excluded.serving_grams, kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g,
         vegetarian = excluded.vegetarian, custom = excluded.custom, updated_at = excluded.updated_at`,
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
        now,
        now,
      ],
    );
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM food_items WHERE id = ? AND custom = 1`, [id]);
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
  created_at: string;
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
    loggedAt: r.created_at,
  };
}

export const mealRepo = {
  async on(date: ISODate): Promise<MealLog[]> {
    const db = await getDb();
    return (await db.query<MealRow>(`SELECT * FROM meal_logs WHERE date = ? ORDER BY time`, [date])).map(rowToMeal);
  },
  async between(from: ISODate, to: ISODate): Promise<MealLog[]> {
    const db = await getDb();
    return (await db.query<MealRow>(`SELECT * FROM meal_logs WHERE date >= ? AND date <= ? ORDER BY date, time`, [from, to])).map(rowToMeal);
  },
  async add(m: Omit<MealLog, 'id' | 'loggedAt'>): Promise<MealLog> {
    const db = await getDb();
    const now = nowIso();
    const log: MealLog = { ...m, id: newId('meal'), loggedAt: now };
    await db.run(
      `INSERT INTO meal_logs (id, date, time, food_id, food_name, servings, kcal, protein_g, carbs_g, fat_g, outside_window, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        now,
        now,
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

interface PhotoRow {
  id: string;
  path: string;
  taken_at: string;
  date: string;
  weight_kg: number | null;
  note: string;
}

export const photoRepo = {
  async all(): Promise<ProgressPhoto[]> {
    const db = await getDb();
    const rows = await db.query<PhotoRow>(`SELECT * FROM photos ORDER BY taken_at`);
    return rows.map((r) => ({ id: r.id, path: r.path, takenAt: r.taken_at, date: r.date, weightKg: r.weight_kg, note: r.note }));
  },
  async add(p: Omit<ProgressPhoto, 'id'>): Promise<ProgressPhoto> {
    const db = await getDb();
    const now = nowIso();
    const photo: ProgressPhoto = { ...p, id: newId('ph') };
    await db.run(`INSERT INTO photos (id, path, taken_at, date, weight_kg, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      photo.id,
      photo.path,
      photo.takenAt,
      photo.date,
      photo.weightKg,
      photo.note,
      now,
      now,
    ]);
    return photo;
  },
  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM photos WHERE id = ?`, [id]);
  },
};

/* ---------------- alarms mirror + notification log ---------------- */

export const alarmRepo = {
  async replaceAll(specs: AlarmSpec[]): Promise<void> {
    const db = await getDb();
    const now = nowIso();
    await db.run(`DELETE FROM alarms`);
    for (const a of specs) {
      await db.run(
        `INSERT INTO alarms (id, kind, ref_id, title, body, hour, minute, days_json, date, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [a.id, a.kind, a.refId, a.title, a.body, a.hour, a.minute, JSON.stringify(a.days), a.date ?? null, now, now],
      );
    }
  },
  async count(): Promise<number> {
    const db = await getDb();
    return (await db.query<{ n: number }>(`SELECT COUNT(*) as n FROM alarms`))[0]?.n ?? 0;
  },
};

interface NotificationLogRow {
  id: string;
  kind: string;
  ref_id: string;
  scheduled_for: string;
  body: string;
  created_at: string;
}

export const notificationLogRepo = {
  async since(isoTimestamp: string): Promise<NotificationLogEntry[]> {
    const db = await getDb();
    const rows = await db.query<NotificationLogRow>(`SELECT * FROM notification_log WHERE scheduled_for >= ? ORDER BY scheduled_for`, [isoTimestamp]);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as NotificationLogEntry['kind'],
      refId: r.ref_id,
      scheduledFor: r.scheduled_for,
      body: r.body,
      createdAt: r.created_at,
    }));
  },
  async add(e: Omit<NotificationLogEntry, 'id' | 'createdAt'>): Promise<void> {
    const db = await getDb();
    const now = nowIso();
    await db.run(`INSERT INTO notification_log (id, kind, ref_id, scheduled_for, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
      newId('nl'),
      e.kind,
      e.refId,
      e.scheduledFor,
      e.body,
      now,
      now,
    ]);
  },
  async deleteFrom(isoTimestamp: string, kind: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM notification_log WHERE scheduled_for >= ? AND kind = ?`, [isoTimestamp, kind]);
  },
};

/* ---------------- steps ---------------- */

export const stepsRepo = {
  async on(date: ISODate): Promise<StepsEntry | null> {
    const db = await getDb();
    const rows = await db.query<{ date: string; steps: number; source: string; updated_at: string }>(`SELECT * FROM steps WHERE date = ?`, [date]);
    return rows.length ? { date: rows[0].date, steps: rows[0].steps, source: rows[0].source as StepsEntry['source'], updatedAt: rows[0].updated_at } : null;
  },
  async set(date: ISODate, steps: number, source: StepsEntry['source']): Promise<void> {
    const db = await getDb();
    const now = nowIso();
    await db.run(
      `INSERT INTO steps (date, steps, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET steps = excluded.steps, source = excluded.source, updated_at = excluded.updated_at`,
      [date, steps, source, now, now],
    );
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
    const now = nowIso();
    await db.run(
      `INSERT INTO weekly_summaries (week_start, week_end, habits_pct, avg_water_ml, workouts_done, weight_delta_kg, avg_kcal, avg_protein_g, xp_earned, generated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(week_start) DO UPDATE SET week_end = excluded.week_end, habits_pct = excluded.habits_pct, avg_water_ml = excluded.avg_water_ml, workouts_done = excluded.workouts_done,
         weight_delta_kg = excluded.weight_delta_kg, avg_kcal = excluded.avg_kcal, avg_protein_g = excluded.avg_protein_g, xp_earned = excluded.xp_earned, generated_at = excluded.generated_at, updated_at = excluded.updated_at`,
      [s.weekStart, s.weekEnd, s.habitsPct, s.avgWaterMl, s.workoutsDone, s.weightDeltaKg, s.avgKcal, s.avgProteinG, s.xpEarned, s.generatedAt, now, now],
    );
  },
};

/* ---------------- points ledger (XP) ---------------- */

export const pointsRepo = {
  async total(): Promise<number> {
    const db = await getDb();
    return (await db.query<{ total: number | null }>(`SELECT SUM(amount) as total FROM points_ledger`))[0]?.total ?? 0;
  },
  async totalOn(date: ISODate): Promise<number> {
    const db = await getDb();
    return (await db.query<{ total: number | null }>(`SELECT SUM(amount) as total FROM points_ledger WHERE date = ?`, [date]))[0]?.total ?? 0;
  },
  async totalBetween(from: ISODate, to: ISODate): Promise<number> {
    const db = await getDb();
    return (
      (await db.query<{ total: number | null }>(`SELECT SUM(amount) as total FROM points_ledger WHERE date >= ? AND date <= ?`, [from, to]))[0]?.total ?? 0
    );
  },
  async add(date: ISODate, amount: number, reason: string): Promise<PointsEntry> {
    const db = await getDb();
    const now = nowIso();
    const ev: PointsEntry = { id: newId('xp'), date, amount, reason, loggedAt: now };
    await db.run(`INSERT INTO points_ledger (id, date, amount, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [
      ev.id,
      ev.date,
      ev.amount,
      ev.reason,
      now,
      now,
    ]);
    return ev;
  },
  async has(date: ISODate, reason: string): Promise<boolean> {
    const db = await getDb();
    return ((await db.query<{ n: number }>(`SELECT COUNT(*) as n FROM points_ledger WHERE date = ? AND reason = ?`, [date, reason]))[0]?.n ?? 0) > 0;
  },
  /** Remove XP previously granted for a reason on a date (used when un-ticking). */
  async revoke(date: ISODate, reason: string): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM points_ledger WHERE date = ? AND reason = ?`, [date, reason]);
  },
};
