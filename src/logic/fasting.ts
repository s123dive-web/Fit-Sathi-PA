import type { HHMM } from '../types';
import { hhmmToMinutes, minutesOfDay } from './dates';

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
 * Fasting window model: fast starts at `start` and ends at `end` (eating window opens).
 * Both may wrap past midnight. Example: start 20:00, end 12:00 → 16:8.
 */
export function fastingState(
  fasting: { enabled: boolean; start: HHMM; end: HHMM },
  now: Date = new Date(),
): FastingState {
  const start = hhmmToMinutes(fasting.start);
  const end = hhmmToMinutes(fasting.end);
  const nowMin = minutesOfDay(now);
  const fastLen = ((end - start + 1440) % 1440) || 1440; // minutes of fasting
  const eatLen = 1440 - fastLen;

  // minutes since fast start, modulo day
  const sinceStart = (nowMin - start + 1440) % 1440;
  const isFasting = sinceStart < fastLen;
  let secondsRemaining: number;
  let progress: number;
  if (isFasting) {
    secondsRemaining = (fastLen - sinceStart) * 60;
    progress = sinceStart / fastLen;
  } else {
    const sinceEnd = sinceStart - fastLen;
    secondsRemaining = (eatLen - sinceEnd) * 60;
    progress = eatLen === 0 ? 1 : sinceEnd / eatLen;
  }
  return {
    enabled: fasting.enabled,
    phase: isFasting ? 'fasting' : 'eating',
    secondsRemaining: Math.round(secondsRemaining),
    progress: Math.min(1, Math.max(0, progress)),
    nextChange: isFasting ? fasting.end : fasting.start,
    fastingHours: Math.round((fastLen / 60) * 10) / 10,
    eatingHours: Math.round((eatLen / 60) * 10) / 10,
  };
}

/** True when a given HH:MM lies inside the eating window. */
export function isInEatingWindow(fasting: { start: HHMM; end: HHMM }, time: HHMM): boolean {
  const start = hhmmToMinutes(fasting.start);
  const end = hhmmToMinutes(fasting.end);
  const t = hhmmToMinutes(time);
  const fastLen = ((end - start + 1440) % 1440) || 1440;
  const sinceStart = (t - start + 1440) % 1440;
  return sinceStart >= fastLen;
}
