import quotesFile from '../data/quotes.json';
import { formatTime, isValidHHMM } from './dates';

export interface QuoteTemplate {
  id: string;
  kind: 'generic' | 'future_you';
  text: string;
}

export interface QuoteContext {
  name: string;
  streak: number;
  bestStreak: number;
  daysToTarget: number | null;
  kgLeft: number;
  weekCompletion: number;
  targetKg: number;
  eatStart: string;
  /** Wake-up time (HH:MM) for {wake}; a friendly word is used when absent. */
  wake?: string;
  /** Eating-window close (HH:MM) for {eatEnd}; a friendly word is used when absent. */
  eatEnd?: string;
}

export const QUOTES: QuoteTemplate[] = (quotesFile as { quotes: QuoteTemplate[] }).quotes;

/** Default no-repeat window of the motivational rotation, in days. */
export const QUOTE_WINDOW_DAYS = 14;

/**
 * How many motivational slots per day the pool can serve without ever repeating a quote inside a
 * `windowDays` window: the planner keeps `windowDays` of history plus `windowDays` of planned slots,
 * so the pool must cover 2 × window × slots.
 */
export function maxDailySlotsForNoRepeat(windowDays = QUOTE_WINDOW_DAYS, poolSize = QUOTES.length): number {
  if (windowDays <= 0) return poolSize;
  return Math.floor(poolSize / (2 * windowDays));
}

function num(v: unknown): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

function time(v: string | undefined, fallback: string): string {
  if (v === undefined || v === null || v === '') return fallback;
  return isValidHHMM(v) ? formatTime(v) : v;
}

/**
 * Replace {placeholders}. Null / non-finite values and unknown placeholders render as friendly
 * text or '' so a line never shows braces or "NaN".
 */
export function renderQuote(template: string, ctx: QuoteContext): string {
  const values: Record<string, string> = {
    name: ctx.name || 'friend',
    streak: num(ctx.streak),
    bestStreak: num(ctx.bestStreak),
    daysToTarget: ctx.daysToTarget === null ? 'a few more' : num(ctx.daysToTarget),
    kgLeft: typeof ctx.kgLeft === 'number' && Number.isFinite(ctx.kgLeft) ? ctx.kgLeft.toFixed(1).replace(/\.0$/, '') : '',
    weekCompletion: num(ctx.weekCompletion),
    targetKg: num(ctx.targetKg),
    eatStart: time(ctx.eatStart, 'noon'),
    eatEnd: time(ctx.eatEnd, 'sunset'),
    wake: time(ctx.wake, 'sunrise'),
  };
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : ''));
}

/** Deterministic PRNG so the rotation is stable for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Unbiased Fisher–Yates shuffle driven by a seeded PRNG; returns a copy. */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rnd = mulberry32(hashString(seed));
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick `count` quotes for upcoming slots.
 * - Quotes in `recentlyUsed` (ids sent or planned inside the window, ordered oldest → newest) are
 *   never reused while fresh ones remain, and a pick never repeats inside itself while the pool allows.
 * - When fresh quotes run out (more slots per day than `maxDailySlotsForNoRepeat`), the
 *   least-recently-used ids are reused first; when even those run out the sequence cycles, so repeats
 *   are spaced as far apart as the pool permits. Every slot always gets a quote.
 */
export function pickQuotes(count: number, recentlyUsed: string[], seed: string, pool: QuoteTemplate[] = QUOTES): QuoteTemplate[] {
  if (count <= 0 || pool.length === 0) return [];
  const used = new Set(recentlyUsed);
  const shuffled = seededShuffle(
    pool.filter((q) => !used.has(q.id)),
    seed,
  );
  // interleave generic and future-you lines so a day gets a mix
  const generic = shuffled.filter((q) => q.kind === 'generic');
  const future = shuffled.filter((q) => q.kind === 'future_you');
  const order: QuoteTemplate[] = [];
  while (generic.length || future.length) {
    const next = order.length % 2 === 0 ? (future.shift() ?? generic.shift()) : (generic.shift() ?? future.shift());
    if (next) order.push(next);
  }
  if (order.length < count) {
    // Fresh pool exhausted: least recently used first (last occurrence decides recency).
    const lastUse = new Map<string, number>();
    recentlyUsed.forEach((id, i) => lastUse.set(id, i));
    const byId = new Map(pool.map((q) => [q.id, q]));
    const lru = [...lastUse.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => byId.get(id))
      .filter((q): q is QuoteTemplate => q !== undefined);
    order.push(...lru);
  }
  const out: QuoteTemplate[] = [];
  for (let i = 0; i < count; i += 1) out.push(order[i % order.length]);
  return out;
}
