import type { HabitStatus, ISODate, MealLog, Profile } from '../types';
import { habitRepo, mealRepo, supplementRepo, waterRepo, weightRepo, xpRepo } from '../db/repos';
import { XP } from '../logic/xp';
import { isInEatingWindow } from '../logic/fasting';
import { notifyChange, showXp, toast } from '../store/appStore';
import { syncNative } from './sync';

/** Mark a habit done / skip / miss (or clear with null). Grants XP on done, revokes on undo. */
export async function setHabitStatus(
  habitId: string,
  date: ISODate,
  status: HabitStatus | null,
  opts: { xp?: number; anchor?: { x: number; y: number }; silent?: boolean } = {},
): Promise<void> {
  const prev = (await habitRepo.logsFor(habitId, date, date))[0]?.status ?? null;
  await habitRepo.setLog(habitId, date, status);
  const reason = `habit:${habitId}`;
  if (status === 'done' && prev !== 'done') {
    const amount = opts.xp ?? XP.habitDone;
    await xpRepo.add(date, amount, reason);
    if (!opts.silent) showXp(amount, opts.anchor?.x, opts.anchor?.y);
  } else if (status !== 'done' && prev === 'done') {
    await xpRepo.revoke(date, reason);
  }
  notifyChange();
  void syncNative();
}

export async function toggleSupplement(
  supplementId: string,
  date: ISODate,
  taken: boolean,
  anchor?: { x: number; y: number },
): Promise<void> {
  const logs = await supplementRepo.logsOn(date);
  const was = logs.some((l) => l.supplementId === supplementId);
  await supplementRepo.setTaken(supplementId, date, taken);
  const reason = `supplement:${supplementId}`;
  if (taken && !was) {
    await xpRepo.add(date, XP.supplementTaken, reason);
    showXp(XP.supplementTaken, anchor?.x, anchor?.y);
  } else if (!taken && was) {
    await xpRepo.revoke(date, reason);
  }
  notifyChange();
  void syncNative();
}

export async function addWater(date: ISODate, ml: number, targetMl: number, anchor?: { x: number; y: number }): Promise<void> {
  const before = await waterRepo.totalOn(date);
  await waterRepo.add(date, ml);
  const after = before + ml;
  let gained = XP.waterTap;
  await xpRepo.add(date, XP.waterTap, `water:tap:${Date.now()}`);
  if (before < targetMl && after >= targetMl) {
    await xpRepo.add(date, XP.waterTargetHit, 'water:target');
    gained += XP.waterTargetHit;
    toast('Water target reached! 💧', 'success');
  }
  showXp(gained, anchor?.x, anchor?.y);
  notifyChange();
  void syncNative();
}

export async function undoWater(date: ISODate): Promise<void> {
  await waterRepo.undoLast(date);
  notifyChange();
  void syncNative();
}

export async function logWeight(date: ISODate, kg: number, anchor?: { x: number; y: number }): Promise<void> {
  await weightRepo.add(date, kg);
  const already = (await xpRepo.totalOn(date)) > 0 && (await hasReason(date, 'weight'));
  if (!already) {
    await xpRepo.add(date, XP.weightLogged, 'weight');
    showXp(XP.weightLogged, anchor?.x, anchor?.y);
  }
  notifyChange();
}

async function hasReason(date: ISODate, reason: string): Promise<boolean> {
  const { getDb } = await import('../db/database');
  const db = await getDb();
  const rows = await db.query<{ n: number }>(`SELECT COUNT(*) as n FROM xp_events WHERE date = ? AND reason = ?`, [date, reason]);
  return (rows[0]?.n ?? 0) > 0;
}

export async function logMeal(
  profile: Profile,
  input: Omit<MealLog, 'id' | 'loggedAt' | 'outsideFastingWindow'>,
  anchor?: { x: number; y: number },
): Promise<MealLog> {
  const outside = profile.fasting.enabled && !isInEatingWindow(profile.fasting, input.time);
  const meal = await mealRepo.add({ ...input, outsideFastingWindow: outside });
  await xpRepo.add(input.date, XP.mealLogged, `meal:${meal.id}`);
  showXp(XP.mealLogged, anchor?.x, anchor?.y);
  if (outside) toast('Logged outside your eating window', 'info');
  notifyChange();
  return meal;
}

export async function removeMeal(id: string, date: ISODate): Promise<void> {
  await mealRepo.remove(id);
  await xpRepo.revoke(date, `meal:${id}`);
  notifyChange();
}
