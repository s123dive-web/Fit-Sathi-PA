import type { Habit, HabitLog, ISODate, WeeklySummary } from '../types';
import { habitRepo, mealRepo, pointsRepo, settingsRepo, summaryRepo, waterRepo, weightRepo } from '../db/repos';
import { addDays, nowIso, todayISO, weekStart } from '../utils/dates';
import { completionStats } from '../utils/habitStrength';
import { dailyWeights } from '../utils/projection';
import { notifyChange } from '../store/appStore';

/** Compute a summary for one week [start, start+6]. */
export async function computeWeeklySummary(start: ISODate, habits: Habit[], allLogs: HabitLog[]): Promise<WeeklySummary> {
  const end = addDays(start, 6);
  let scheduled = 0;
  let done = 0;
  let workouts = 0;
  for (const h of habits) {
    if (h.createdAt > end) continue;
    const logs = allLogs.filter((l) => l.habitId === h.id);
    const from = h.createdAt > start ? h.createdAt : start;
    const st = completionStats(h.schedule, logs, from, end);
    scheduled += Math.max(0, st.scheduled - st.skipped);
    done += st.done;
    if (h.kind === 'workout') workouts += logs.filter((l) => l.status === 'done' && l.date >= start && l.date <= end).length;
  }
  const habitsPct = scheduled === 0 ? 0 : Math.round((done / scheduled) * 100);

  const water = await waterRepo.dailyTotals(start, end);
  const waterVals = [...water.values()];
  const avgWaterMl = waterVals.length ? Math.round(waterVals.reduce((a, b) => a + b, 0) / 7) : 0;

  const weights = dailyWeights(await weightRepo.all());
  const prevWeek = weights.filter((w) => w.date < start).slice(-1)[0];
  const inWeek = weights.filter((w) => w.date >= start && w.date <= end);
  let weightDeltaKg: number | null = null;
  if (inWeek.length) {
    const last = inWeek[inWeek.length - 1];
    const base = prevWeek ?? inWeek[0];
    if (base !== last) weightDeltaKg = Math.round((last.kg - base.kg) * 100) / 100;
  }

  const meals = await mealRepo.between(start, end);
  const mealDays = new Set(meals.map((m) => m.date)).size;
  const avgKcal = mealDays ? Math.round(meals.reduce((a, m) => a + m.kcal, 0) / mealDays) : null;
  const avgProteinG = mealDays ? Math.round(meals.reduce((a, m) => a + m.proteinG, 0) / mealDays) : null;
  const xpEarned = await pointsRepo.totalBetween(start, end);

  return {
    weekStart: start,
    weekEnd: end,
    habitsPct,
    avgWaterMl,
    workoutsDone: workouts,
    weightDeltaKg,
    avgKcal,
    avgProteinG,
    xpEarned,
    generatedAt: nowIso(),
  };
}

/**
 * Generate summaries for every closed week since the first data point. Runs on app start / resume,
 * so the card for the latest closed week appears automatically once Sunday is over.
 */
export async function ensureWeeklySummaries(): Promise<void> {
  const today = todayISO();
  const thisWeek = weekStart(today);
  const settings = await settingsRepo.get();
  const habits = await habitRepo.all(true);
  const logs = await habitRepo.allLogs();
  const weights = await weightRepo.all();
  const firstDates = [...habits.map((h) => h.createdAt), ...weights.map((w) => w.date), ...logs.map((l) => l.date)].sort();
  if (!firstDates.length) return;
  const existing = new Set((await summaryRepo.all()).map((s) => s.weekStart));
  let ws = weekStart(firstDates[0]);
  let changed = false;
  let guard = 0;
  while (ws < thisWeek && guard < 520) {
    guard += 1;
    if (!existing.has(ws)) {
      await summaryRepo.upsert(await computeWeeklySummary(ws, habits, logs));
      changed = true;
    }
    ws = addDays(ws, 7);
  }
  const lastClosed = addDays(thisWeek, -7);
  if (settings.lastWeeklySummaryFor !== lastClosed) {
    await settingsRepo.set('lastWeeklySummaryFor', lastClosed);
    changed = true;
  }
  if (changed) notifyChange();
}

/** Live (in-progress) summary for the current week. */
export async function currentWeekSummary(): Promise<WeeklySummary> {
  const habits = await habitRepo.all(true);
  const logs = await habitRepo.allLogs();
  return computeWeeklySummary(weekStart(todayISO()), habits, logs);
}
