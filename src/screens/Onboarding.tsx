import { useState } from 'react';
import type { HeightUnit, Profile } from '../types';
import { Card } from '../components/ui';
import { ProfileForm } from '../components/ProfileForm';
import { ProfileImport } from '../components/ProfileImport';
import { emptyProfile, habitsFromProfile, validateProfile } from '../utils/profile';
import { habitRepo, profileRepo, settingsRepo } from '../db/repos';
import { notifyChange, toast } from '../store/appStore';
import { syncNative } from '../services/sync';
import { FitAlarms } from '../native/plugins';
import { t } from '../i18n';
import { PRIVACY_POLICY_URL } from '../components/AboutCard';

type Step = 'choose' | 'import' | 'manual';

/** Apply an accepted profile: save it, seed habits (opt-in), store preferences, request notification permission. */
export async function completeOnboarding(profile: Profile, createHabits: boolean, heightUnit: HeightUnit): Promise<void> {
  await profileRepo.save(profile);
  if (createHabits) {
    const existing = await habitRepo.all(true);
    const names = new Set(existing.map((h) => h.name.toLowerCase()));
    for (const h of habitsFromProfile(profile, existing.length)) if (!names.has(h.name.toLowerCase())) await habitRepo.upsert(h);
  }
  await settingsRepo.update({
    onboarded: true,
    theme: profile.preferences?.theme ?? 'system',
    weightUnit: profile.preferences?.weightUnit ?? 'kg',
    heightUnit: profile.preferences?.heightUnit ?? heightUnit,
  });
  await FitAlarms.requestNotificationPermission().catch(() => undefined);
  notifyChange();
  void syncNative();
}

export function Onboarding({ existing }: { existing: Profile | null }) {
  const [step, setStep] = useState<Step>('choose');
  const [draft, setDraft] = useState<Profile>(existing ?? emptyProfile());
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm');
  const [errors, setErrors] = useState<string[]>([]);
  const [createHabits, setCreateHabits] = useState(true);
  const [saving, setSaving] = useState(false);

  const finish = async (profile: Profile) => {
    setSaving(true);
    try {
      await completeOnboarding(profile, createHabits, heightUnit);
      toast(t('onboarding.welcome', { name: profile.user.name }), 'success');
    } finally {
      setSaving(false);
    }
  };

  const submitManual = () => {
    const res = validateProfile(draft);
    if (!res.ok || !res.profile) {
      setErrors(res.errors);
      return;
    }
    setErrors([]);
    void finish(res.profile);
  };

  return (
    <div className="mx-auto max-w-lg px-4 pb-10" style={{ paddingTop: 'calc(1.5rem + var(--safe-top))' }}>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white">✓</div>
        <h1 className="text-2xl font-bold">{t('app.name')}</h1>
        <p className="text-sm text-slate-500">{t('app.tagline')}</p>
      </div>

      {step === 'choose' && (
        <div className="space-y-3">
          <button className="card w-full text-left active:scale-[0.99]" onClick={() => setStep('import')}>
            <div className="text-lg font-semibold">{t('onboarding.importTitle')}</div>
            <p className="text-sm text-slate-500">{t('onboarding.importBody')}</p>
          </button>
          <button className="card w-full text-left active:scale-[0.99]" onClick={() => setStep('manual')}>
            <div className="text-lg font-semibold">{t('onboarding.manualTitle')}</div>
            <p className="text-sm text-slate-500">{t('onboarding.manualBody')}</p>
          </button>
        </div>
      )}

      {step === 'import' && (
        <div className="space-y-3">
          <ProfileImport
            existing={existing}
            onImported={(p) => void finish(p)}
            extra={
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input type="checkbox" checked={createHabits} onChange={(e) => setCreateHabits(e.target.checked)} />
                {t('onboarding.createHabits')}
              </label>
            }
          />
          <button className="btn-ghost w-full" onClick={() => setStep('choose')}>
            {t('common.back')}
          </button>
        </div>
      )}

      {step === 'manual' && (
        <div className="space-y-4">
          <ProfileForm
            value={draft}
            onChange={setDraft}
            heightUnit={heightUnit}
            onHeightUnit={setHeightUnit}
            weightUnit={draft.preferences?.weightUnit ?? 'kg'}
          />
          <Card>
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="checkbox" checked={createHabits} onChange={(e) => setCreateHabits(e.target.checked)} />
              {t('onboarding.createHabits')}
            </label>
          </Card>
          {errors.length > 0 && (
            <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200" role="alert">
              <div className="font-medium">{t('onboarding.fix')}</div>
              <ul className="list-disc pl-5">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => setStep('choose')}>
              {t('common.back')}
            </button>
            <button className="btn-primary flex-1" disabled={saving} onClick={submitManual}>
              {saving ? t('common.saving') : t('onboarding.start')}
            </button>
          </div>
        </div>
      )}

      <footer className="mt-8 px-2 text-center text-xs text-slate-400">
        <p>{t('onboarding.privacyNote')}</p>
        <a
          className="mt-1 inline-flex min-h-[44px] items-center text-brand-600 underline-offset-2 hover:underline"
          href={PRIVACY_POLICY_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('about.privacyPolicy')}
        </a>
      </footer>
    </div>
  );
}
