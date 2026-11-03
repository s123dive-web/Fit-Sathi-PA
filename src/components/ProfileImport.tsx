import { useState, type ReactNode } from 'react';
import type { Profile } from '../types';
import { diffProfiles, parseProfileJson, type DiffEntry } from '../utils/profile';
import { FitBackup } from '../native/plugins';
import { toast } from '../store/appStore';
import { Card } from './ui';
import { t } from '../i18n';

/** Human label for a diff path such as `fasting.eatEnd`, `habits[3l_water]` or `supplements[sup_x]`. */
export function labelForPath(path: string, after: string, before?: string): string {
  const m = /^(habits|supplements)\[(.+)\]$/.exec(path);
  if (m) {
    const name = (after !== '—' ? after : (before ?? '')).split(' · ')[0] || m[2].replace(/[_-]+/g, ' ');
    return t(m[1] === 'habits' ? 'import.habitLabel' : 'import.supplementLabel', { name });
  }
  const key = `import.labels.${path}`;
  const hit = t(key);
  if (hit !== key) return hit;
  // Fallback: prettify "notifications.waterReminderIntervalMin" → "Notifications · Water reminder interval min"
  return path
    .split('.')
    .map((part) =>
      part
        .replace(/\[.*\]/g, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase()),
    )
    .join(' · ');
}

/** Import a profile JSON: pick / paste → validate → show diff → confirm. */
export function ProfileImport({ existing, onImported, extra }: { existing: Profile | null; onImported: (p: Profile) => void; extra?: ReactNode }) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<Profile | null>(null);
  const [diff, setDiff] = useState<DiffEntry[]>([]);
  const [picking, setPicking] = useState(false);

  const validate = (raw: string) => {
    const res = parseProfileJson(raw);
    if (!res.ok || !res.profile) {
      setErrors(res.errors);
      setCandidate(null);
      return;
    }
    setErrors([]);
    setCandidate(res.profile);
    setDiff(diffProfiles(existing, res.profile));
  };

  const pickFile = async () => {
    setPicking(true);
    try {
      const res = await FitBackup.openDocument({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
      if (res.data) {
        setText(res.data);
        validate(res.data);
      }
    } catch (e) {
      toast(t('import.pickFailed', { msg: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card title={t('import.title')}>
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={pickFile} disabled={picking}>
            {t('import.chooseFile')}
          </button>
          <button className="btn-ghost" onClick={() => validate(text)} disabled={!text.trim()}>
            {t('import.validatePasted')}
          </button>
        </div>
        <textarea
          className="input mt-3 min-h-[120px] font-mono text-xs"
          placeholder={t('import.placeholder')}
          aria-label={t('import.title')}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCandidate(null);
          }}
        />
        <p className="mt-2 text-xs text-slate-500">{t('import.hint')}</p>
      </Card>

      {errors.length > 0 && (
        <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200" role="alert">
          <div className="font-medium">{t('import.invalid')}</div>
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {candidate && (
        <Card title={existing ? t('import.changes', { count: diff.length }) : t('import.preview')}>
          {diff.length === 0 && <p className="text-sm text-slate-500">{t('import.identical')}</p>}
          <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {diff.map((d) => (
              <li key={d.path} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                <div className="text-[11px] font-medium text-slate-500">{labelForPath(d.path, d.after, d.before)}</div>
                {existing && d.kind !== 'added' && <div className="text-rose-600 line-through">{d.before}</div>}
                <div className="text-brand-700 dark:text-brand-300">{d.after}</div>
              </li>
            ))}
          </ul>
          {extra && <div className="mt-3">{extra}</div>}
          <button className="btn-primary mt-3 w-full" onClick={() => onImported(candidate)}>
            {existing ? t('import.overwrite') : t('import.useFor', { name: candidate.user.name })}
          </button>
        </Card>
      )}
    </div>
  );
}
