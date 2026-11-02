import { describe, expect, it } from 'vitest';
import { buildTrendSeries, movingAverage7, projectToTarget, regressionSlope } from '../utils/projection';
import type { WeightEntry } from '../types';

const w = (date: string, kg: number): WeightEntry => ({ id: date, date, kg, loggedAt: `${date}T07:00:00Z` });

function series(start: string, days: number, startKg: number, perDay: number): WeightEntry[] {
  const out: WeightEntry[] = [];
  for (let i = 0; i < days; i += 1) out.push(w(shift(start, i), Math.round((startKg + perDay * i) * 100) / 100));
  return out;
}

describe('projection', () => {
  it('computes a 7-day moving average', () => {
    const pts = series('2026-01-01', 10, 80, 0).map((e) => ({ date: e.date, kg: e.kg }));
    pts[9].kg = 87; // spike
    const ma = movingAverage7(pts);
    expect(ma.get('2026-01-10')).toBe(81);
  });

  it('finds the slope of a steady loss', () => {
    const s = regressionSlope(series('2026-01-01', 28, 84, -0.1).map((e) => ({ date: e.date, kg: e.kg })));
    expect(s).not.toBeNull();
    expect(s as number).toBeCloseTo(-0.1, 3);
  });

  it('projects an ETA when moving towards the target', () => {
    const p = projectToTarget(series('2026-01-01', 28, 84, -0.1), 74, '2026-01-28');
    expect(p.status).toBe('on_track');
    expect(p.slopeKgPerWeek).toBeCloseTo(-0.7, 1);
    expect(p.daysToTarget).toBeGreaterThan(60);
    expect(p.etaDate).not.toBeNull();
  });

  it('reports moving away when gaining while target is lower', () => {
    const p = projectToTarget(series('2026-01-01', 28, 84, 0.1), 74, '2026-01-28');
    expect(p.status).toBe('moving_away');
  });

  it('needs enough data', () => {
    const p = projectToTarget([w('2026-01-01', 84), w('2026-01-02', 83.8)], 74, '2026-01-02');
    expect(p.status).toBe('insufficient_data');
  });

  it('detects target reached', () => {
    const p = projectToTarget(series('2026-01-01', 10, 74.1, 0), 74, '2026-01-10');
    expect(p.status).toBe('reached');
  });

  it('builds a series extending to the ETA with a projection line', () => {
    const entries = series('2026-01-01', 28, 84, -0.1);
    const s = buildTrendSeries(entries, 80, '2026-01-28');
    const last = s[s.length - 1];
    expect(last.projected).not.toBeNull();
    expect(last.date > '2026-01-28').toBe(true);
    expect(s[0].kg).toBe(84);
  });
});

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
