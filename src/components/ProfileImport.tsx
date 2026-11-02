import { useState, type ReactNode } from 'react';
import type { Profile } from '../types';
import { diffProfiles, parseProfileJson, type DiffEntry } from '../logic/profile';
import { FitBackup } from '../native/plugins';
import { Card } from './ui';

/** Import a profile JSON: pick / paste → validate → show diff → confirm. */
export function ProfileImport({ existing, onImported, extra }: { existing: Profile | null; onImported: (p: Profile) => void; extra?: ReactNode }) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<Profile | null>(null);
  const [diff, setDiff] = useState<DiffEntry[]>([]);

  const validate = (raw: string) => {
    const res = parseProfileJson(raw);
    if (!res.ok) {
      setErrors(res.errors);
      setCandidate(null);
      return;
    }
    setErrors([]);
    setCandidate(res.profile!);
    setDiff(diffProfiles(existing, res.profile!));
  };

  const pickFile = async () => {
    const res = await FitBackup.openDocument({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
    if (res.data) {
      setText(res.data);
      validate(res.data);
    }
  };

  return (
    <div className="space-y-3">
      <Card title="Profile JSON">
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={pickFile}>
            Choose file…
          </button>
          <button className="btn-ghost" onClick={() => validate(text)} disabled={!text.trim()}>
            Validate pasted
          </button>
        </div>
        <textarea
          className="input mt-3 min-h-[120px] font-mono text-xs"
          placeholder='{"schemaVersion": 1, "name": "...", ...}'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCandidate(null);
          }}
        />
        <p className="mt-2 text-xs text-slate-500">Schema: src/schema/profile.schema.json · sample: sample/suresh_profile.json</p>
      </Card>

      {errors.length > 0 && (
        <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">
          <div className="font-medium">Invalid profile</div>
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {candidate && (
        <Card title={existing ? `Changes (${diff.length})` : 'Preview'}>
          {diff.length === 0 && <p className="text-sm text-slate-500">Identical to the current profile.</p>}
          <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
            {diff.map((d) => (
              <li key={d.path} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                <div className="font-mono text-[11px] text-slate-500">{d.path}</div>
                {existing && d.kind !== 'added' && <div className="text-rose-600 line-through">{d.before}</div>}
                <div className="text-brand-700 dark:text-brand-300">{d.after}</div>
              </li>
            ))}
          </ul>
          {extra && <div className="mt-3">{extra}</div>}
          <button className="btn-primary mt-3 w-full" onClick={() => onImported(candidate)}>
            {existing ? 'Overwrite profile' : `Use this profile for ${candidate.name}`}
          </button>
        </Card>
      )}
    </div>
  );
}
