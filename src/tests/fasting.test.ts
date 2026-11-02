import { describe, expect, it } from 'vitest';
import { fastingState, fastingWarningTime, isInEatingWindow } from '../utils/fasting';

const win = { enabled: true, eatStart: '12:00', eatEnd: '19:00' };

describe('fasting window (eating 12:00–19:00)', () => {
  it('is fasting at 08:00 with countdown to 12:00', () => {
    const s = fastingState(win, new Date(2026, 0, 1, 8, 0, 0));
    expect(s.phase).toBe('fasting');
    expect(s.secondsRemaining).toBe(4 * 3600);
    expect(s.nextChange).toBe('12:00');
    expect(s.fastingHours).toBe(17);
    expect(s.eatingHours).toBe(7);
  });

  it('is eating at 15:00 with countdown to the 19:00 close', () => {
    const s = fastingState(win, new Date(2026, 0, 1, 15, 0, 0));
    expect(s.phase).toBe('eating');
    expect(s.secondsRemaining).toBe(4 * 3600);
    expect(s.nextChange).toBe('19:00');
  });

  it('handles the overnight part of the fast', () => {
    const s = fastingState(win, new Date(2026, 0, 1, 23, 30, 0));
    expect(s.phase).toBe('fasting');
    expect(s.secondsRemaining).toBe(12.5 * 3600);
  });

  it('flags meals outside the eating window', () => {
    expect(isInEatingWindow(win, '13:00')).toBe(true);
    expect(isInEatingWindow(win, '18:59')).toBe(true);
    expect(isInEatingWindow(win, '19:00')).toBe(false);
    expect(isInEatingWindow(win, '07:00')).toBe(false);
  });

  it('computes the pre-close warning time', () => {
    expect(fastingWarningTime(win, 30)).toBe('18:30');
    expect(fastingWarningTime({ eatEnd: '00:10' }, 30)).toBe('23:40');
  });
});
