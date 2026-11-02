import { describe, expect, it } from 'vitest';
import { fastingState, isInEatingWindow } from '../logic/fasting';

const win = { enabled: true, start: '20:00', end: '12:00' };

describe('fasting window', () => {
  it('is fasting at 08:00 with countdown to 12:00', () => {
    const s = fastingState(win, new Date(2026, 0, 1, 8, 0, 0));
    expect(s.phase).toBe('fasting');
    expect(s.secondsRemaining).toBe(4 * 3600);
    expect(s.nextChange).toBe('12:00');
    expect(s.fastingHours).toBe(16);
    expect(s.eatingHours).toBe(8);
  });

  it('is eating at 15:00 with countdown to 20:00', () => {
    const s = fastingState(win, new Date(2026, 0, 1, 15, 0, 0));
    expect(s.phase).toBe('eating');
    expect(s.secondsRemaining).toBe(5 * 3600);
    expect(s.nextChange).toBe('20:00');
  });

  it('handles midnight wrap', () => {
    const s = fastingState(win, new Date(2026, 0, 1, 23, 30, 0));
    expect(s.phase).toBe('fasting');
    expect(s.secondsRemaining).toBe(12.5 * 3600);
  });

  it('flags meals outside the eating window', () => {
    expect(isInEatingWindow(win, '13:00')).toBe(true);
    expect(isInEatingWindow(win, '19:59')).toBe(true);
    expect(isInEatingWindow(win, '20:00')).toBe(false);
    expect(isInEatingWindow(win, '07:00')).toBe(false);
  });
});
