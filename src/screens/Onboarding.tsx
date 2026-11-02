import { useState } from 'react';
import type { Profile } from '../types';
import { Card } from '../components/ui';
import { ProfileForm, normalizeProfile } from '../components/ProfileForm';
import { ProfileImport } from '../components/ProfileImport';
import { emptyProfile, starterHabits, validateProfile } from '../logic/profile';
import { habitRepo, profileRepo, settingsRepo } from '../db/repos';
import { notifyChange, toast } from '../store/appStore';
import { syncNative } from '../services/sync';
import { FitAlarms } from '../native/plugins';

type Step = 'choose' | 'import' | 'manual';

export function Onboarding({ existing }: { existing: Profile | null }) {
  const [step, setStep] = useState<Step>('choose');
  const [draft, setDraft] = useState<Profile>(existing ?? emptyProfile());
  const [errors, setErrors] = useState<string[]>([]);
  const [createStarters, setCreateStarters] = useState(true);
  const [saving, setSaving] = useState(false);

  const finish = async (profile: Profile) => {
    setSaving(true);
    try {
      await profileRepo.save(profile);
      if (createStarters && (await habitRepo.all(true)).length === 0) {
        for (const h of starterHabits(profile)) await habitRepo.upsert(h);
      }
      await settingsRepo.update({
        onboarded: true,
        theme: profile.preferences?.theme ?? 'system',
        weightUnit: profile.preferences?.weightUnit ?? 'kg',
      });
      await FitAlarms.requestNotificationPermission().catch(() => undefined);
      notifyChange();
      void syncNative();
      toast(`Welcome, ${profile.name}! 🎉`, 'success');
    } finally {
      setSaving(false);
    }
  };

  const submitManual = () => {
    const normalized = normalizeProfile(draft);
    const res = validateProfile(normalized);
    if (!res.ok) {
      setErrors(res.errors);
      return;
    }
    setErrors([]);
    void finish(res.profile!);
  };

  return (
    <div className="mx-auto max-w-lg px-4 pb-10" style={{ paddingTop: 'calc(1.5rem + var(--safe-top))' }}>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white">✓</div>
        <h1 className="text-2xl font-bold">FitSaathi</h1>
        <p className="text-sm text-slate-500">Your offline fitness & habit companion</p>
      </div>

      {step === 'choose' && (
        <div className="space-y-3">
          <button className="card w-full text-left active:scale-[0.99]" onClick={() => setStep('import')}>
            <div className="text-lg font-semibold">📄 Import profile JSON</div>
            <p className="text-sm text-slate-500">Load a profile file exported earlier or prepared for you. It is validated before anything is saved.</p>
          </button>
          <button className="card w-full text-left active:scale-[0.99]" onClick={() => setStep('manual')}>
            <div className="text-lg font-semibold">✍️ Fill manually</div>
            <p className="text-sm text-slate-500">Enter your details step by step. You can export them as JSON later.</p>
          </button>
          <p className="px-2 text-center text-xs text-slate-400">Everything stays on this phone. No account, no cloud.</p>
        </div>
      )}

      {step === 'import' && (
        <div className="space-y-3">
          <ProfileImport
            existing={existing}
            onImported={(p) => void finish(p)}
            extra={
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={createStarters} onChange={(e) => setCreateStarters(e.target.checked)} />
                Create starter habits from this profile (workout, fasting, sleep…)
              </label>
            }
          />
          <button className="btn-ghost w-full" onClick={() => setStep('choose')}>
            Back
          </button>
        </div>
      )}

      {step === 'manual' && (
        <div className="space-y-4">
          <ProfileForm value={draft} onChange={setDraft} />
          <Card>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={createStarters} onChange={(e) => setCreateStarters(e.target.checked)} />
              Create starter habits from this profile
            </label>
          </Card>
          {errors.length > 0 && (
            <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">
              <div className="font-medium">Please fix:</div>
              <ul className="list-disc pl-5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setStep('choose')}>
              Back
            </button>
            <button className="btn-primary flex-1" disabled={saving} onClick={submitManual}>
              {saving ? 'Saving…' : 'Start'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
