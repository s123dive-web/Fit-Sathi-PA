import type { HHMM } from '../types';
import { hhmmToMinutes, minutesOfDay, minutesToHHMM } from './dates';

export interface FastingWindow {
  enabled: boolean;
  eatStart: HHMM;
  eatEnd: HHMM;
}

export interface FastingState {
  enabled: boolean;
  phase: 'fasting' | 'eating';
  /** seconds until the current phase ends */
  secondsRemaining: number;
  /** 0..1 progress through the current phase */
  progress: number;
  nextChange: HHMM;
  fastingHours: number;
  eatingHours: number;
}

/**
 * Eating window model: eating from `eatStart` to `eatEnd`; fasting the rest of the day.
 * Example: 12:00 → 19:00 is a 17:7 schedule. Windows may wrap past midnight.
 */
export function fastingState(w: FastingWindow, now: Date = new Date()): FastingState {
  const eatStart = hhmmToMinutes(w.eatStart);
  const eatEnd = hhmmToMinutes(w.eatEnd);
  const eatLen = (eatEnd - eatStart + 1440) % 1440 || 1440;
  const fastLen = 1440 - eatLen;
  const nowMin = minutesOfDay(now);
  const sinceEatStart = (nowMin - eatStart + 1440) % 1440;
  const isEating = sinceEatStart < eatLen;
  let secondsRemaining: number;
  let progress: number;
  if (isEating) {
    secondsRemaining = (eatLen - sinceEatStart) * 60;
    progress = sinceEatStart / eatLen;
  } else {
    const sinceFastStart = sinceEatStart - eatLen;
    secondsRemaining = (fastLen - sinceFastStart) * 60;
    progress = fastLen === 0 ? 1 : sinceFastStart / fastLen;
  }
  return {
    enabled: w.enabled,
    phase: isEating ? 'eating' : 'fasting',
    secondsRemaining: Math.round(secondsRemaining),
    progress: Math.min(1, Math.max(0, progress)),
    nextChange: isEating ? w.eatEnd : w.eatStart,
    fastingHours: Math.round((fastLen / 60) * 10) / 10,
    eatingHours: Math.round((eatLen / 60) * 10) / 10,
  };
}

/** True when a given HH:MM lies inside the eating window. */
export function isInEatingWindow(w: { eatStart: HHMM; eatEnd: HHMM }, time: HHMM): boolean {
  const eatStart = hhmmToMinutes(w.eatStart);
  const eatEnd = hhmmToMinutes(w.eatEnd);
  const eatLen = (eatEnd - eatStart + 1440) % 1440 || 1440;
  const since = (hhmmToMinutes(time) - eatStart + 1440) % 1440;
  return since < eatLen;
}

/** Time of the "eating window closes soon" warning. */
export function fastingWarningTime(w: { eatEnd: HHMM }, minutesBefore: number): HHMM {
  return minutesToHHMM(hhmmToMinutes(w.eatEnd) - minutesBefore);
}
