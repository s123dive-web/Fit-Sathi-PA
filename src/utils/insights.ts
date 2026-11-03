import type { ISODate, WeeklySummary } from '../types';
import type { GoalDirection } from './projection';

export interface Insight {
  id: string;
  title: string;
  detail: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  /** Weeks on the "condition met" side (or the weeks summarised, for non-comparison insights). */
  weeksA: number;
  /** Weeks on the "condition not met" side (0 for non-comparison insights). */
  weeksB: number;
}

export interface InsightOptions {
  /** Which way the scale should move; defaults to 'lose'. */
  goal?: GoalDirection;
}

/** Minimum completed weeks on each side of a comparison before a correlation is claimed. */
export const MIN_WEEKS_PER_SIDE = 4;
/** Smallest difference in average weekly change (kg) worth reporting. */
const MIN_DIFF_KG = 0.2;
/** For a maintain goal, an average weekly change inside this band counts as holding steady. */
const MAINTAIN_BAND_KG = 0.3;

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fmtDelta(kg: number): string {
  const sign = kg > 0 ? '+' : kg < 0 ? '−' : '';
  return `${sign}${Math.abs(kg).toFixed(1)} kg`;
}

/** Is a weekly change of `kg` good news for this goal? */
function favourable(goal: GoalDirection, kg: number): boolean {
  if (goal === 'gain') return kg > 0;
  if (goal === 'maintain') return Math.abs(kg) < MAINTAIN_BAND_KG;
  return kg < 0;
}

/** Sentiment of "condition weeks average hAvg vs other weeks lAvg" for this goal. */
function compareSentiment(goal: GoalDirection, hAvg: number, lAvg: number): 'positive' | 'negative' {
  if (goal === 'maintain') return Math.abs(hAvg) < Math.abs(lAvg) ? 'positive' : 'negative';
  return favourable(goal, hAvg - lAvg) ? 'positive' : 'negative';
}

interface Rule {
  id: string;
  label: string;
  threshold: (w: WeeklySummary) => boolean;
  describeHigh: string;
  describeLow: string;
}

/**
 * Daylio-style rule-based correlations, fully on-device.
 * Splits completed weeks by a condition and compares the average weekly weight change.
 * Requires at least MIN_WEEKS_PER_SIDE weeks on each side to say anything; the week counts are
 * returned so the UI can show the sample size.
 */
export function computeInsights(summaries: WeeklySummary[], waterTargetMl: number, opts: InsightOptions = {}): Insight[] {
  const goal = opts.goal ?? 'lose';
  const weeks = summaries.filter((w) => w.weightDeltaKg !== null);
  const insights: Insight[] = [];
  const rules: Rule[] = [
    {
      id: 'workouts6',
      label: 'workouts',
      threshold: (w) => w.workoutsDone >= 6,
      describeHigh: 'weeks with ≥6 workouts',
      describeLow: 'weeks with <6 workouts',
    },
    {
      id: 'workouts4',
      label: 'workouts',
      threshold: (w) => w.workoutsDone >= 4,
      describeHigh: 'weeks with ≥4 workouts',
      describeLow: 'weeks with <4 workouts',
    },
    {
      id: 'water',
      label: 'water',
      threshold: (w) => w.avgWaterMl >= waterTargetMl * 0.9,
      describeHigh: 'weeks hitting the water target',
      describeLow: 'weeks under the water target',
    },
    {
      id: 'habits80',
      label: 'habits',
      threshold: (w) => w.habitsPct >= 80,
      describeHigh: 'weeks with ≥80% habits done',
      describeLow: 'weeks under 80%',
    },
  ];
  const seenLabels = new Set<string>();
  for (const rule of rules) {
    if (seenLabels.has(rule.label)) continue;
    const high = weeks.filter(rule.threshold);
    const low = weeks.filter((w) => !rule.threshold(w));
    if (high.length < MIN_WEEKS_PER_SIDE || low.length < MIN_WEEKS_PER_SIDE) continue;
    const hAvg = avg(high.map((w) => w.weightDeltaKg as number));
    const lAvg = avg(low.map((w) => w.weightDeltaKg as number));
    if (hAvg === null || lAvg === null) continue;
    if (Math.abs(hAvg - lAvg) < MIN_DIFF_KG) continue;
    seenLabels.add(rule.label);
    insights.push({
      id: rule.id,
      title: `${capitalize(rule.describeHigh)}: avg ${fmtDelta(hAvg)}`,
      detail: `${capitalize(rule.describeLow)}: avg ${fmtDelta(lAvg)} (${high.length} vs ${low.length} weeks)`,
      sentiment: compareSentiment(goal, hAvg, lAvg),
      weeksA: high.length,
      weeksB: low.length,
    });
  }

  if (weeks.length >= 3) {
    const recent = weeks.slice(-4);
    const total = recent.reduce((a, w) => a + (w.weightDeltaKg ?? 0), 0);
    const perWeek = total / recent.length;
    insights.push({
      id: 'recent',
      title: `Last ${recent.length} weeks: ${fmtDelta(total)}`,
      detail: `Average ${fmtDelta(perWeek)} per week`,
      sentiment: total === 0 && goal !== 'maintain' ? 'neutral' : favourable(goal, perWeek) ? 'positive' : 'negative',
      weeksA: recent.length,
      weeksB: 0,
    });
  }

  if (summaries.length >= 2) {
    const bestHabit = [...summaries].sort((a, b) => b.habitsPct - a.habitsPct)[0];
    insights.push({
      id: 'best_week',
      title: `Best habit week: ${bestHabit.habitsPct}%`,
      detail: `Week of ${bestHabit.weekStart}`,
      sentiment: 'neutral',
      weeksA: summaries.length,
      weeksB: 0,
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'need_more',
      title: 'Keep logging',
      detail: 'Insights appear once there are a few weeks of habit, water and weight data.',
      sentiment: 'neutral',
      weeksA: weeks.length,
      weeksB: 0,
    });
  }
  return insights;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isSundayOrLater(weekEndIso: ISODate, today: ISODate): boolean {
  return today >= weekEndIso;
}
