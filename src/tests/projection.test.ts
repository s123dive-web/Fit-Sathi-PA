import { describe, expect, it } from 'vitest';
import { buildTrendSeries, dailyWeights, goalDirection, movingAverage7, projectToTarget, regressionSlope } from '../utils/projection';
import type { WeightEntry } from '../types';

const w = (date: string, kg: number, loggedAt = `${date}T07:00:00Z`): WeightEntry => ({ id: `${date}-${loggedAt}`, date, kg, loggedAt });

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
    expect(p.lastDate).toBe('2026-01-28');
    expect(p.stale).toBe(false);
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

  it('reports a flat trend when the weight is not moving', () => {
    const p = projectToTarget(series('2026-01-01', 28, 80, 0), 74, '2026-01-28');
    expect(p.status).toBe('flat');
    expect(p.etaDate).toBeNull();
  });

  it('H5: anchors the ETA at the last weigh-in, not at today', () => {
    const entries = series('2026-01-01', 28, 84, -0.1);
    const sameDay = projectToTarget(entries, 74, '2026-01-28');
    const later = projectToTarget(entries, 74, '2026-02-05');
    expect(later.status).toBe('on_track');
    expect(later.etaDate).toBe(sameDay.etaDate); // the ETA does not slide forward with the calendar
    expect(later.daysToTarget).toBe((sameDay.daysToTarget as number) - 8);
    expect(later.lastDate).toBe('2026-01-28');
  });

  it('H5: a weigh-in older than 14 days is stale → insufficient_data', () => {
    const entries = series('2026-01-01', 28, 84, -0.1);
    const p = projectToTarget(entries, 74, '2026-02-20');
    expect(p.status).toBe('insufficient_data');
    expect(p.stale).toBe(true);
    expect(p.etaDate).toBeNull();
    expect(p.lastDate).toBe('2026-01-28');
    expect(p.latestKg).toBe(81.3);
    // exactly 14 days old is still fine
    expect(projectToTarget(entries, 74, '2026-02-11').stale).toBe(false);
  });

  it('H5: overshooting the target counts as reached, not moving away', () => {
    const lost = projectToTarget(series('2026-01-01', 28, 80, -0.3), 74, '2026-01-28');
    expect(lost.latestMa7 as number).toBeLessThan(74);
    expect(lost.status).toBe('reached');
    expect(lost.daysToTarget).toBe(0);
    const gained = projectToTarget(series('2026-01-01', 28, 60, 0.3), 65, '2026-01-28');
    expect(gained.latestMa7 as number).toBeGreaterThan(65);
    expect(gained.status).toBe('reached');
  });

  it('H5: honours an explicit goal direction', () => {
    const rising = series('2026-01-01', 28, 60, 0.1);
    expect(projectToTarget(rising, 70, '2026-01-28').status).toBe('on_track'); // derived: first weigh-in 60 < 70 → gain
    expect(projectToTarget(rising, 70, '2026-01-28', { goal: 'gain' }).status).toBe('on_track');
    // For a losing goal, being under the target already counts as reached.
    expect(projectToTarget(rising, 70, '2026-01-28', { goal: 'lose' }).status).toBe('reached');
    const falling = series('2026-01-01', 28, 80, -0.1);
    expect(projectToTarget(falling, 75, '2026-01-28').status).toBe('on_track'); // derived: 80 > 75 → lose
    expect(projectToTarget(falling, 75, '2026-01-28', { goal: 'gain' }).status).toBe('reached');
    expect(goalDirection(76, 65)).toBe('lose');
    expect(goalDirection(60, 70)).toBe('gain');
    expect(goalDirection(70, 70.3)).toBe('maintain');
  });

  it('H5: needs at least 4 points in the regression window before reporting a trend', () => {
    const three = [w('2026-01-01', 84), w('2026-01-06', 83.5), w('2026-01-11', 83)];
    expect(regressionSlope(three.map((e) => ({ date: e.date, kg: e.kg })))).toBeNull();
    expect(projectToTarget(three, 74, '2026-01-11').status).toBe('insufficient_data');
    const four = [...three, w('2026-01-16', 82.5)];
    expect(regressionSlope(four.map((e) => ({ date: e.date, kg: e.kg })))).toBeCloseTo(-0.1, 3);
    expect(projectToTarget(four, 74, '2026-01-16').status).toBe('on_track');
  });

  it('collapses duplicate same-day entries to the latest one', () => {
    const dup = [w('2026-01-01', 80, '2026-01-01T07:00:00Z'), w('2026-01-01', 79, '2026-01-01T20:00:00Z'), w('2026-01-01', 81, '2026-01-01T12:00:00Z')];
    expect(dailyWeights(dup)).toEqual([{ date: '2026-01-01', kg: 79 }]);
    const entries = [...series('2026-01-01', 28, 84, -0.1), w('2026-01-28', 70, '2026-01-28T23:00:00Z')];
    const p = projectToTarget(entries, 74, '2026-01-28');
    expect(p.latestKg).toBe(70);
    expect(buildTrendSeries(entries, 74, '2026-01-28').filter((pt) => pt.date === '2026-01-28')).toHaveLength(1);
  });
});

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
