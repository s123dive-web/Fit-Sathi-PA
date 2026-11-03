import { describe, expect, it } from 'vitest';
import { fastingState, fastingWarningTime, isInEatingWindow } from '../utils/fasting';

const win = { enabled: true, eatStart: '12:00', eatEnd: '19:00' };
const night = { enabled: true, eatStart: '20:00', eatEnd: '02:00' };

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

describe('fasting window that wraps past midnight (eating 20:00–02:00)', () => {
  it('has a 6 h eating / 18 h fasting split', () => {
    const s = fastingState(night, new Date(2026, 0, 1, 23, 0, 0));
    expect(s.eatingHours).toBe(6);
    expect(s.fastingHours).toBe(18);
  });

  it('is eating before and after midnight with the countdown to 02:00', () => {
    const before = fastingState(night, new Date(2026, 0, 1, 23, 0, 0));
    expect(before.phase).toBe('eating');
    expect(before.secondsRemaining).toBe(3 * 3600);
    expect(before.nextChange).toBe('02:00');
    expect(before.progress).toBeCloseTo(0.5, 6);
    const after = fastingState(night, new Date(2026, 0, 2, 1, 0, 0));
    expect(after.phase).toBe('eating');
    expect(after.secondsRemaining).toBe(1 * 3600);
    expect(after.nextChange).toBe('02:00');
  });

  it('is fasting from 02:00 to 20:00', () => {
    const s = fastingState(night, new Date(2026, 0, 2, 3, 0, 0));
    expect(s.phase).toBe('fasting');
    expect(s.secondsRemaining).toBe(17 * 3600);
    expect(s.nextChange).toBe('20:00');
    const noon = fastingState(night, new Date(2026, 0, 2, 12, 0, 0));
    expect(noon.phase).toBe('fasting');
    expect(noon.secondsRemaining).toBe(8 * 3600);
  });

  it('classifies meal times across the midnight boundary', () => {
    expect(isInEatingWindow(night, '19:59')).toBe(false);
    expect(isInEatingWindow(night, '20:00')).toBe(true);
    expect(isInEatingWindow(night, '23:59')).toBe(true);
    expect(isInEatingWindow(night, '00:00')).toBe(true);
    expect(isInEatingWindow(night, '01:59')).toBe(true);
    expect(isInEatingWindow(night, '02:00')).toBe(false);
    expect(isInEatingWindow(night, '10:00')).toBe(false);
  });

  it('warns before a close that is just after midnight', () => {
    expect(fastingWarningTime(night, 30)).toBe('01:30');
    expect(fastingWarningTime(night, 150)).toBe('23:30');
  });
});
