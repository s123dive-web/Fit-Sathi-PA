import type { ISODate, WeightEntry } from '../types';
import { addDays, diffDays, eachDay } from './dates';

export type GoalDirection = 'lose' | 'gain' | 'maintain';

/** Which way the user wants the scale to move. Within ±0.5 kg counts as maintaining. */
export function goalDirection(currentKg: number, targetKg: number): GoalDirection {
  if (targetKg < currentKg - 0.5) return 'lose';
  if (targetKg > currentKg + 0.5) return 'gain';
  return 'maintain';
}

export interface TrendPoint {
  date: ISODate;
  kg: number | null;
  ma7: number | null;
  projected: number | null;
}

export interface Projection {
  slopeKgPerDay: number | null;
  slopeKgPerWeek: number | null;
  etaDate: ISODate | null;
  daysToTarget: number | null;
  status: 'on_track' | 'moving_away' | 'flat' | 'insufficient_data' | 'reached';
  latestKg: number | null;
  latestMa7: number | null;
}

/** Collapse multiple entries on a day to the latest, sorted ascending. */
export function dailyWeights(entries: WeightEntry[]): { date: ISODate; kg: number }[] {
  const map = new Map<ISODate, { kg: number; at: string }>();
  for (const e of entries) {
    const cur = map.get(e.date);
    if (!cur || e.loggedAt > cur.at) map.set(e.date, { kg: e.kg, at: e.loggedAt });
  }
  return [...map.entries()].map(([date, v]) => ({ date, kg: v.kg })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 7-day trailing moving average over logged days (window by calendar days). */
export function movingAverage7(points: { date: ISODate; kg: number }[]): Map<ISODate, number> {
  const out = new Map<ISODate, number>();
  for (let i = 0; i < points.length; i += 1) {
    const end = points[i].date;
    const start = addDays(end, -6);
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && points[j].date >= start; j -= 1) {
      sum += points[j].kg;
      n += 1;
    }
    out.set(end, Math.round((sum / n) * 100) / 100);
  }
  return out;
}

/** Ordinary least squares over last `windowDays` of daily weights. Returns slope in kg/day. */
export function regressionSlope(points: { date: ISODate; kg: number }[], windowDays = 28): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1].date;
  const cutoff = addDays(last, -windowDays);
  const pts = points.filter((p) => p.date > cutoff);
  if (pts.length < 2) return null;
  const span = diffDays(pts[0].date, pts[pts.length - 1].date);
  if (span < 5) return null; // need at least ~a week of spread for a meaningful slope
  const xs = pts.map((p) => diffDays(pts[0].date, p.date));
  const ys = pts.map((p) => p.kg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

export function projectToTarget(entries: WeightEntry[], targetKg: number, today: ISODate): Projection {
  const pts = dailyWeights(entries);
  const empty: Projection = {
    slopeKgPerDay: null,
    slopeKgPerWeek: null,
    etaDate: null,
    daysToTarget: null,
    status: 'insufficient_data',
    latestKg: null,
    latestMa7: null,
  };
  if (pts.length === 0) return empty;
  const ma = movingAverage7(pts);
  const latest = pts[pts.length - 1];
  const latestMa7 = ma.get(latest.date) ?? latest.kg;
  const base = { ...empty, latestKg: latest.kg, latestMa7 };

  const remaining = targetKg - latestMa7; // negative when losing weight
  if (Math.abs(remaining) < 0.25) return { ...base, status: 'reached', daysToTarget: 0, etaDate: today };

  const slope = regressionSlope(pts);
  if (slope === null) return base;
  const slopeWeek = Math.round(slope * 7 * 100) / 100;
  if (Math.abs(slope) < 0.005) {
    return { ...base, slopeKgPerDay: slope, slopeKgPerWeek: slopeWeek, status: 'flat' };
  }
  const movingTowards = Math.sign(slope) === Math.sign(remaining);
  if (!movingTowards) {
    return { ...base, slopeKgPerDay: slope, slopeKgPerWeek: slopeWeek, status: 'moving_away' };
  }
  const days = Math.ceil(remaining / slope);
  const eta = addDays(today, Math.min(days, 3650));
  return {
    ...base,
    slopeKgPerDay: slope,
    slopeKgPerWeek: slopeWeek,
    etaDate: eta,
    daysToTarget: days,
    status: 'on_track',
  };
}

/** Build chart series: actual, 7-day MA and projection line extended to the ETA (or +60 days). */
export function buildTrendSeries(entries: WeightEntry[], targetKg: number, today: ISODate): TrendPoint[] {
  const pts = dailyWeights(entries);
  if (pts.length === 0) return [];
  const ma = movingAverage7(pts);
  const proj = projectToTarget(entries, targetKg, today);
  const byDate = new Map(pts.map((p) => [p.date, p.kg]));
  const first = pts[0].date;
  const lastActual = pts[pts.length - 1].date;
  const horizonEnd = proj.status === 'on_track' && proj.etaDate ? proj.etaDate : addDays(lastActual, proj.slopeKgPerDay !== null ? 30 : 0);
  const end = horizonEnd > lastActual ? horizonEnd : lastActual;
  const anchor = proj.latestMa7 ?? pts[pts.length - 1].kg;
  const series: TrendPoint[] = [];
  for (const d of eachDay(first, end)) {
    const kg = byDate.get(d) ?? null;
    const ma7 = ma.get(d) ?? null;
    let projected: number | null = null;
    if (proj.slopeKgPerDay !== null && d >= lastActual) {
      const dd = diffDays(lastActual, d);
      projected = Math.round((anchor + proj.slopeKgPerDay * dd) * 100) / 100;
    }
    series.push({ date: d, kg, ma7, projected });
  }
  return series;
}
