import type { ISODate, WeeklySummary } from '../types';

export interface Insight {
  id: string;
  title: string;
  detail: string;
  sentiment: 'positive' | 'neutral' | 'negative';
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fmtDelta(kg: number): string {
  const sign = kg > 0 ? '+' : kg < 0 ? '−' : '';
  return `${sign}${Math.abs(kg).toFixed(1)} kg`;
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
 * Requires at least 2 weeks on each side to say anything.
 */
export function computeInsights(summaries: WeeklySummary[], waterTargetMl: number): Insight[] {
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
    if (high.length < 2 || low.length < 2) continue;
    const hAvg = avg(high.map((w) => w.weightDeltaKg as number));
    const lAvg = avg(low.map((w) => w.weightDeltaKg as number));
    if (hAvg === null || lAvg === null) continue;
    const diff = hAvg - lAvg;
    if (Math.abs(diff) < 0.1) continue;
    seenLabels.add(rule.label);
    insights.push({
      id: rule.id,
      title: `${capitalize(rule.describeHigh)}: avg ${fmtDelta(hAvg)}`,
      detail: `${capitalize(rule.describeLow)}: avg ${fmtDelta(lAvg)} (${high.length} vs ${low.length} weeks)`,
      sentiment: diff < 0 ? 'positive' : 'negative',
    });
  }

  if (weeks.length >= 3) {
    const recent = weeks.slice(-4);
    const total = recent.reduce((a, w) => a + (w.weightDeltaKg ?? 0), 0);
    insights.push({
      id: 'recent',
      title: `Last ${recent.length} weeks: ${fmtDelta(total)}`,
      detail: `Average ${fmtDelta(total / recent.length)} per week`,
      sentiment: total < 0 ? 'positive' : total > 0 ? 'negative' : 'neutral',
    });
  }

  if (summaries.length >= 2) {
    const bestHabit = [...summaries].sort((a, b) => b.habitsPct - a.habitsPct)[0];
    insights.push({
      id: 'best_week',
      title: `Best habit week: ${bestHabit.habitsPct}%`,
      detail: `Week of ${bestHabit.weekStart}`,
      sentiment: 'neutral',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'need_more',
      title: 'Keep logging',
      detail: 'Insights appear once there are a few weeks of habit, water and weight data.',
      sentiment: 'neutral',
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
