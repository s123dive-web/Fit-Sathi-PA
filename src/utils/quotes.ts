import quotesFile from '../data/quotes.json';

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
}

export const QUOTES: QuoteTemplate[] = (quotesFile as { quotes: QuoteTemplate[] }).quotes;

/** Replace {placeholders}. Unknown or null values fall back to friendly text so a line never shows braces. */
export function renderQuote(template: string, ctx: QuoteContext): string {
  const values: Record<string, string> = {
    name: ctx.name || 'friend',
    streak: String(ctx.streak),
    bestStreak: String(ctx.bestStreak),
    daysToTarget: ctx.daysToTarget === null ? 'a few more' : String(ctx.daysToTarget),
    kgLeft: ctx.kgLeft.toFixed(1).replace(/\.0$/, ''),
    weekCompletion: String(ctx.weekCompletion),
    targetKg: String(ctx.targetKg),
    eatStart: ctx.eatStart,
  };
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => values[key] ?? '');
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

/**
 * Pick `count` quote ids that have not been used within the window, never repeating inside the pick.
 * `recentlyUsed` are quote ids sent in the last 14 days. If the pool runs dry the least-recently-used
 * ids are reused (only possible with fewer than 28 templates).
 */
export function pickQuotes(count: number, recentlyUsed: string[], seed: string, pool: QuoteTemplate[] = QUOTES): QuoteTemplate[] {
  const used = new Set(recentlyUsed);
  const fresh = pool.filter((q) => !used.has(q.id));
  const rnd = mulberry32(hashString(seed));
  const shuffled = [...fresh].sort(() => rnd() - 0.5);
  // interleave generic and future-you lines so a day gets a mix
  const generic = shuffled.filter((q) => q.kind === 'generic');
  const future = shuffled.filter((q) => q.kind === 'future_you');
  const out: QuoteTemplate[] = [];
  while (out.length < count && (generic.length || future.length)) {
    const next = out.length % 2 === 0 ? (future.shift() ?? generic.shift()) : (generic.shift() ?? future.shift());
    if (next) out.push(next);
  }
  if (out.length < count) {
    // fallback: least recently used first (recentlyUsed is ordered oldest → newest)
    for (const id of recentlyUsed) {
      const q = pool.find((x) => x.id === id);
      if (q && !out.includes(q)) out.push(q);
      if (out.length >= count) break;
    }
  }
  return out.slice(0, count);
}
