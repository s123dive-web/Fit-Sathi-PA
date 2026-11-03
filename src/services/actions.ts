import type { HabitStatus, ISODate, MealLog, Profile } from '../types';
import { getDb } from '../db/database';
import { habitRepo, mealRepo, pointsRepo, supplementRepo, waterRepo, weightRepo } from '../db/repos';
import { XP } from '../utils/xp';
import { isInEatingWindow } from '../utils/fasting';
import { computeStreaks } from '../utils/habitStrength';
import { isMilestone } from '../utils/milestones';
import { habitActiveOn } from '../utils/schedule';
import { successHaptic, tapHaptic } from '../utils/haptics';
import { celebrate, notifyChange, showXp, toast } from '../store/appStore';
import { t } from '../i18n';
import { scheduleSync } from './sync';

export type Anchor = { x: number; y: number };

/**
 * Mark a habit done / skip / miss (or clear with null). Grants XP on done (once per habit per day), revokes on undo,
 * confetti on milestones. The log write and the XP write are one transaction so a crash cannot leave them apart.
 */
export async function setHabitStatus(
  habitId: string,
  date: ISODate,
  status: HabitStatus | null,
  opts: { xp?: number; anchor?: Anchor; silent?: boolean } = {},
): Promise<void> {
  const db = await getDb();
  const reason = `habit:${habitId}`;
  let granted = 0;
  await db.transaction(async () => {
    const prev = (await habitRepo.logsFor(habitId, date, date))[0]?.status ?? null;
    await habitRepo.setLog(habitId, date, status);
    if (status === 'done' && prev !== 'done') {
      if (!(await pointsRepo.has(date, reason))) {
        granted = opts.xp ?? XP.habitDone;
        await pointsRepo.add(date, granted, reason);
      }
    } else if (status !== 'done' && prev === 'done') {
      await pointsRepo.revoke(date, reason);
    }
  });
  if (granted && !opts.silent) {
    showXp(granted, opts.anchor?.x, opts.anchor?.y);
    void tapHaptic();
    const habit = await habitRepo.get(habitId);
    if (habit) {
      const streak = computeStreaks(habit.schedule, await habitRepo.logsFor(habitId), habit.createdAt, date);
      const milestoneReason = `milestone:${habitId}:${streak.current}`;
      if (streak.unit === 'days' && isMilestone(streak.current) && !(await pointsRepo.has(date, milestoneReason))) {
        await pointsRepo.add(date, XP.streakBonusPer7, milestoneReason);
        celebrate(t('today.milestone', { n: streak.current }));
        void successHaptic();
      }
    }
  }
  notifyChange();
  scheduleSync();
}

export async function toggleSupplement(supplementId: string, date: ISODate, taken: boolean, anchor?: Anchor): Promise<void> {
  const db = await getDb();
  const reason = `supplement:${supplementId}`;
  let granted = 0;
  await db.transaction(async () => {
    const was = (await supplementRepo.logsOn(date)).some((l) => l.supplementId === supplementId);
    await supplementRepo.setTaken(supplementId, date, taken);
    if (taken && !was && !(await pointsRepo.has(date, reason))) {
      granted = XP.supplementTaken;
      await pointsRepo.add(date, granted, reason);
    } else if (!taken && was) {
      await pointsRepo.revoke(date, reason);
    }
  });
  if (granted) {
    showXp(granted, anchor?.x, anchor?.y);
    void tapHaptic();
  }
  notifyChange();
  scheduleSync();
}

/**
 * Add water. Grants 1 XP per tap and a one-time bonus when the daily target is first reached; when a `water`-kind
 * habit is scheduled today and still open, reaching the target ticks it off automatically.
 */
export async function addWater(date: ISODate, ml: number, targetMl: number, anchor?: Anchor): Promise<void> {
  const db = await getDb();
  let gained = 0;
  let hitTarget = false;
  await db.transaction(async () => {
    const before = await waterRepo.totalOn(date);
    await waterRepo.add(date, ml);
    const after = before + ml;
    await pointsRepo.add(date, XP.waterTap, `water:tap:${Date.now()}`);
    gained = XP.waterTap;
    if (before < targetMl && after >= targetMl && !(await pointsRepo.has(date, 'water:target'))) {
      await pointsRepo.add(date, XP.waterTargetHit, 'water:target');
      gained += XP.waterTargetHit;
      hitTarget = true;
    }
  });
  if (hitTarget) {
    toast(t('today.waterTarget'), 'success');
    void successHaptic();
    // Auto-complete the water habit for the day, if there is one and it is not logged yet.
    const waterHabit = (await habitRepo.all()).find((h) => h.kind === 'water' && habitActiveOn(h, date));
    if (waterHabit) {
      const logged = (await habitRepo.logsFor(waterHabit.id, date, date))[0]?.status ?? null;
      if (logged === null) await setHabitStatus(waterHabit.id, date, 'done', { xp: waterHabit.xp, silent: true });
    }
  } else {
    void tapHaptic();
  }
  showXp(gained, anchor?.x, anchor?.y);
  notifyChange();
  scheduleSync();
}

/** Undo the last water tap of the day, including its XP and the target bonus if the day drops below target. */
export async function undoWater(date: ISODate, targetMl?: number): Promise<void> {
  const db = await getDb();
  await db.transaction(async () => {
    const before = await waterRepo.totalOn(date);
    if (before <= 0) return;
    await waterRepo.undoLast(date);
    await pointsRepo.revokeLatestLike(date, 'water:tap:');
    const after = await waterRepo.totalOn(date);
    if (targetMl !== undefined && before >= targetMl && after < targetMl) await pointsRepo.revoke(date, 'water:target');
  });
  notifyChange();
  scheduleSync();
}

export async function logWeight(date: ISODate, kg: number, anchor?: Anchor): Promise<void> {
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) throw new Error(t('errors.weightRange'));
  const db = await getDb();
  let granted = 0;
  await db.transaction(async () => {
    await weightRepo.add(date, kg);
    if (!(await pointsRepo.has(date, 'weight'))) {
      granted = XP.weightLogged;
      await pointsRepo.add(date, granted, 'weight');
    }
  });
  if (granted) showXp(granted, anchor?.x, anchor?.y);
  void tapHaptic();
  notifyChange();
  scheduleSync();
}

export async function logMeal(profile: Profile, input: Omit<MealLog, 'id' | 'loggedAt' | 'outsideFastingWindow'>, anchor?: Anchor): Promise<MealLog> {
  if (!(input.servings > 0) || !Number.isFinite(input.servings)) throw new Error(t('errors.servingsRange'));
  const outside = profile.fasting.enabled && !isInEatingWindow(profile.fasting, input.time);
  const db = await getDb();
  const meal = await db.transaction(async () => {
    const m = await mealRepo.add({ ...input, outsideFastingWindow: outside });
    await pointsRepo.add(input.date, XP.mealLogged, `meal:${m.id}`);
    return m;
  });
  showXp(XP.mealLogged, anchor?.x, anchor?.y);
  void tapHaptic();
  if (outside) toast(t('food.loggedOutside'), 'info');
  notifyChange();
  return meal;
}

export async function removeMeal(id: string, date: ISODate): Promise<void> {
  const db = await getDb();
  await db.transaction(async () => {
    await mealRepo.remove(id);
    await pointsRepo.revoke(date, `meal:${id}`);
  });
  notifyChange();
}
