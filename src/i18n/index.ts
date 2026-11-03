import en from './en.json';

/**
 * Minimal i18n: one JSON file per language with dotted keys and {placeholders}.
 * English is the default; add `hi.json` / `mr.json` and register them in LOCALES to switch.
 */
type Dict = { [key: string]: string | Dict };

const LOCALES: Record<string, Dict> = { en: en as Dict };
let current = 'en';

export function setLocale(locale: string): void {
  if (LOCALES[locale]) current = locale;
}

export function getLocale(): string {
  return current;
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const raw = lookup(LOCALES[current], key) ?? lookup(LOCALES.en, key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

/**
 * Plural-aware lookup: picks `${key}.one` for n === 1 and `${key}.other` otherwise (falls back to `key`).
 * The count is available to the template as {n}.
 */
export function tn(key: string, n: number, params: Record<string, string | number> = {}): string {
  const form = n === 1 ? 'one' : 'other';
  const full = lookup(LOCALES[current], `${key}.${form}`) ?? lookup(LOCALES.en, `${key}.${form}`);
  return t(full !== undefined ? `${key}.${form}` : key, { n, ...params });
}
