import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { maxDailySlotsForNoRepeat, pickQuotes, QUOTES, renderQuote, seededShuffle, type QuoteContext } from '../utils/quotes';

const ctx: QuoteContext = { name: 'Suresh', streak: 5, bestStreak: 12, daysToTarget: 90, kgLeft: 11, weekCompletion: 71, targetKg: 65, eatStart: '12:00' };

describe('quote engine', () => {
  it('ships at least 60 templates with both kinds', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(60);
    expect(QUOTES.some((q) => q.kind === 'generic')).toBe(true);
    expect(QUOTES.some((q) => q.kind === 'future_you')).toBe(true);
    expect(new Set(QUOTES.map((q) => q.id)).size).toBe(QUOTES.length);
  });

  it('renders every placeholder and never leaves braces', () => {
    for (const q of QUOTES) expect(renderQuote(q.text, ctx)).not.toMatch(/[{}]/);
    expect(renderQuote('{name}, {daysToTarget} days to {targetKg} kg.', ctx)).toBe('Suresh, 90 days to 65 kg.');
    expect(renderQuote('{daysToTarget}', { ...ctx, daysToTarget: null })).toBe('a few more');
  });

  it('H7: unknown placeholders and non-finite numbers render as empty, never NaN', () => {
    expect(renderQuote('[{foo}]', ctx)).toBe('[]');
    expect(renderQuote('[{constructor}]', ctx)).toBe('[]');
    expect(renderQuote('[{streak}]', { ...ctx, streak: NaN })).toBe('[]');
    expect(renderQuote('[{kgLeft}]', { ...ctx, kgLeft: NaN })).toBe('[]');
    expect(renderQuote('[{weekCompletion}]', { ...ctx, weekCompletion: undefined as unknown as number })).toBe('[]');
    expect(renderQuote('[{daysToTarget}]', { ...ctx, daysToTarget: Infinity })).toBe('[]');
    expect(renderQuote('[{name}]', { ...ctx, name: '' })).toBe('[friend]');
  });

  it('H7: wake and eatEnd placeholders use the context, with friendly fallbacks', () => {
    expect(renderQuote('{wake}', { ...ctx, wake: '05:30' })).toContain('5:30');
    expect(renderQuote('{eatEnd}', { ...ctx, eatEnd: '19:00' })).toMatch(/19:00|7:00 pm/);
    expect(renderQuote('{wake}', ctx)).toBe('sunrise');
    expect(renderQuote('{eatEnd}', ctx)).toBe('sunset');
  });

  it('quotes.json is not owner-specific and only uses declared placeholders', () => {
    const raw = readFileSync(new URL('../data/quotes.json', import.meta.url), 'utf8');
    const file = JSON.parse(raw) as { placeholders: string[]; quotes: { text: string }[] };
    expect(raw).not.toMatch(/cricket|wicket|\d\d:\d\d/i);
    const declared = new Set(file.placeholders);
    const used = new Set<string>();
    for (const q of file.quotes) for (const m of q.text.matchAll(/\{(\w+)\}/g)) used.add(m[1]);
    for (const key of used) expect(declared.has(key)).toBe(true);
    expect(used.has('wake')).toBe(true);
    expect(used.has('eatEnd')).toBe(true);
  });

  it('rotates 28 slots (14 days × 2) without repeating', () => {
    const picked = pickQuotes(28, [], 'seed');
    expect(picked).toHaveLength(28);
    expect(new Set(picked.map((q) => q.id)).size).toBe(28);
  });

  it('never reuses a quote sent in the last 14 days while fresh ones remain', () => {
    const first = pickQuotes(28, [], 'a').map((q) => q.id);
    const second = pickQuotes(28, first, 'b').map((q) => q.id);
    expect(second.some((id) => first.includes(id))).toBe(false);
    expect(new Set(second).size).toBe(28);
  });

  it('is deterministic for a seed and mixes kinds', () => {
    const a = pickQuotes(6, [], 'same').map((q) => q.id);
    const b = pickQuotes(6, [], 'same').map((q) => q.id);
    expect(a).toEqual(b);
    const kinds = new Set(pickQuotes(6, [], 'same').map((q) => q.kind));
    expect(kinds.size).toBe(2);
  });

  it('H7: seeded Fisher–Yates is a deterministic, unbiased permutation', () => {
    const items = [0, 1, 2, 3];
    expect(seededShuffle(items, 'x')).toEqual(seededShuffle(items, 'x'));
    expect([...seededShuffle(items, 'x')].sort()).toEqual(items);
    expect(seededShuffle(items, 'x')).not.toEqual(seededShuffle(items, 'y'));
    // Where item 0 lands should be spread evenly across the 4 positions (≈25 % each).
    const counts = [0, 0, 0, 0];
    const runs = 4000;
    for (let i = 0; i < runs; i += 1) counts[seededShuffle(items, `seed-${i}`).indexOf(0)] += 1;
    for (const c of counts) expect(c / runs).toBeGreaterThan(0.2);
    for (const c of counts) expect(c / runs).toBeLessThan(0.3);
  });

  it('H7: the pool supports 2 slots/day without repeats in a 14-day window', () => {
    expect(maxDailySlotsForNoRepeat()).toBe(Math.floor(QUOTES.length / 28));
    expect(maxDailySlotsForNoRepeat()).toBeGreaterThanOrEqual(2);
    expect(maxDailySlotsForNoRepeat(14, 100)).toBe(3);
    expect(maxDailySlotsForNoRepeat(7, 64)).toBe(4);
  });

  it('H7: with 3 slots/day it degrades by reusing the least-recently-used quotes first', () => {
    const first = pickQuotes(42, [], 'a').map((q) => q.id);
    expect(new Set(first).size).toBe(42);
    const second = pickQuotes(42, first, 'b').map((q) => q.id);
    expect(second).toHaveLength(42);
    expect(new Set(second).size).toBe(42); // never repeats inside the pick while the pool allows
    const freshCount = QUOTES.length - 42;
    const fresh = second.slice(0, freshCount);
    expect(fresh.some((id) => first.includes(id))).toBe(false);
    const reused = second.slice(freshCount);
    expect(reused).toEqual(first.slice(0, reused.length)); // oldest first, in order
  });

  it('H7: more slots than the pool cycles instead of leaving slots empty', () => {
    const picked = pickQuotes(QUOTES.length + 6, [], 's').map((q) => q.id);
    expect(picked).toHaveLength(QUOTES.length + 6);
    expect(new Set(picked.slice(0, QUOTES.length)).size).toBe(QUOTES.length);
    expect(picked.slice(QUOTES.length)).toEqual(picked.slice(0, 6));
    expect(pickQuotes(0, [], 's')).toEqual([]);
    expect(pickQuotes(3, [], 's', [])).toEqual([]);
  });
});
