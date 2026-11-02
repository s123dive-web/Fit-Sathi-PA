import type { HabitStatus, ISODate, MealLog, Profile } from '../types';
import { habitRepo, mealRepo, pointsRepo, supplementRepo, waterRepo, weightRepo } from '../db/repos';
import { XP } from '../utils/xp';
import { isInEatingWindow } from '../utils/fasting';
import { computeStreaks } from '../utils/habitStrength';
import { isMilestone } from '../utils/milestones';
import { successHaptic, tapHaptic } from '../utils/haptics';
import { celebrate, notifyChange, showXp, toast } from '../store/appStore';
import { t } from '../i18n';
import { syncNative } from './sync';

/** Mark a habit done / skip / miss (or clear with null). Grants XP on done, revokes on undo, confetti on milestones. */
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
    await pointsRepo.add(date, amount, reason);
    if (!opts.silent) {
      showXp(amount, opts.anchor?.x, opts.anchor?.y);
      void tapHaptic();
      const habit = await habitRepo.get(habitId);
      if (habit) {
        const streak = computeStreaks(habit.schedule, await habitRepo.logsFor(habitId), habit.createdAt, date);
        if (streak.unit === 'days' && isMilestone(streak.current)) {
          await pointsRepo.add(date, XP.streakBonusPer7, `milestone:${habitId}:${streak.current}`);
          celebrate(t('today.milestone', { n: streak.current }));
          void successHaptic();
        }
      }
    }
  } else if (status !== 'done' && prev === 'done') {
    await pointsRepo.revoke(date, reason);
  }
  notifyChange();
  void syncNative();
}

export async function toggleSupplement(supplementId: string, date: ISODate, taken: boolean, anchor?: { x: number; y: number }): Promise<void> {
  const logs = await supplementRepo.logsOn(date);
  const was = logs.some((l) => l.supplementId === supplementId);
  await supplementRepo.setTaken(supplementId, date, taken);
  const reason = `supplement:${supplementId}`;
  if (taken && !was) {
    await pointsRepo.add(date, XP.supplementTaken, reason);
    showXp(XP.supplementTaken, anchor?.x, anchor?.y);
    void tapHaptic();
  } else if (!taken && was) {
    await pointsRepo.revoke(date, reason);
  }
  notifyChange();
  void syncNative();
}

export async function addWater(date: ISODate, ml: number, targetMl: number, anchor?: { x: number; y: number }): Promise<void> {
  const before = await waterRepo.totalOn(date);
  await waterRepo.add(date, ml);
  const after = before + ml;
  let gained = XP.waterTap;
  await pointsRepo.add(date, XP.waterTap, `water:tap:${Date.now()}`);
  if (before < targetMl && after >= targetMl) {
    await pointsRepo.add(date, XP.waterTargetHit, 'water:target');
    gained += XP.waterTargetHit;
    toast(t('today.waterTarget'), 'success');
    void successHaptic();
  } else {
    void tapHaptic();
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
  if (!(await pointsRepo.has(date, 'weight'))) {
    await pointsRepo.add(date, XP.weightLogged, 'weight');
    showXp(XP.weightLogged, anchor?.x, anchor?.y);
  }
  void tapHaptic();
  notifyChange();
  void syncNative();
}

export async function logMeal(
  profile: Profile,
  input: Omit<MealLog, 'id' | 'loggedAt' | 'outsideFastingWindow'>,
  anchor?: { x: number; y: number },
): Promise<MealLog> {
  const outside = profile.fasting.enabled && !isInEatingWindow(profile.fasting, input.time);
  const meal = await mealRepo.add({ ...input, outsideFastingWindow: outside });
  await pointsRepo.add(input.date, XP.mealLogged, `meal:${meal.id}`);
  showXp(XP.mealLogged, anchor?.x, anchor?.y);
  void tapHaptic();
  if (outside) toast(t('food.loggedOutside'), 'info');
  notifyChange();
  return meal;
}

export async function removeMeal(id: string, date: ISODate): Promise<void> {
  await mealRepo.remove(id);
  await pointsRepo.revoke(date, `meal:${id}`);
  notifyChange();
}
