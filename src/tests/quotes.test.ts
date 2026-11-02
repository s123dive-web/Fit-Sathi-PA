import { describe, expect, it } from 'vitest';
import { pickQuotes, QUOTES, renderQuote, type QuoteContext } from '../utils/quotes';

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
});
