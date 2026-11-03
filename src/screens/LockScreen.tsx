import { useEffect, useState } from 'react';
import type { Settings } from '../types';
import { PinPad } from '../components/PinPad';
import { Modal } from '../components/ui';
import { attemptPin, biometricUnlock, remainingLockout, unlockApp } from '../services/security';
import { FitBiometric } from '../native/plugins';
import { getDb } from '../db/database';
import { notifyChange } from '../store/appStore';
import { successHaptic } from '../utils/haptics';
import { t } from '../i18n';

export function LockScreen({ settings, name }: { settings: Settings; name: string }) {
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(() => remainingLockout(settings));
  const [bioAvailable, setBioAvailable] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!settings.biometricEnabled) return;
      const a = await FitBiometric.isAvailable().catch(() => ({ available: false }));
      if (!alive || !a.available) return;
      setBioAvailable(true);
      if (await biometricUnlock()) {
        void successHaptic();
        unlockApp();
      }
    })();
    return () => {
      alive = false;
    };
  }, [settings.biometricEnabled]);

  const submit = async (pin: string) => {
    const r = await attemptPin(pin);
    if (r.ok) {
      void successHaptic();
      unlockApp();
      return;
    }
    setResetKey((k) => k + 1);
    if (r.lockedForSec) {
      setCooldown(r.lockedForSec);
      setError(t('security.lockedOut', { s: fmt(r.lockedForSec) }));
    } else {
      setError(`${t('security.wrongPin')} · ${t('security.attemptsLeft', { n: r.attemptsLeft })}`);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <div className="flex min-h-full flex-col items-center justify-center px-6 py-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 text-3xl text-white">🔒</div>
          <h1 className="text-xl font-bold">{t('security.lockedTitle')}</h1>
          <p className="text-sm text-slate-500">
            {name ? `${name} · ` : ''}
            {t('security.lockedSubtitle')}
          </p>
        </div>
        <PinPad
          onComplete={(p) => void submit(p)}
          error={cooldown > 0 ? t('security.lockedOut', { s: fmt(cooldown) }) : error}
          disabled={cooldown > 0}
          resetKey={resetKey}
          extraKey={
            bioAvailable
              ? {
                  label: t('security.unlockWithBiometric'),
                  icon: '🫆',
                  onPress: async () => {
                    if (await biometricUnlock()) {
                      void successHaptic();
                      unlockApp();
                    }
                  },
                }
              : undefined
          }
        />
        <button className="mt-6 min-h-[44px] text-sm text-slate-500 underline-offset-2 hover:underline" onClick={() => setForgot(true)}>
          {t('security.forgot')}
        </button>
      </div>

      <Modal
        open={forgot}
        onClose={() => setForgot(false)}
        title={t('security.forgot')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setForgot(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (!confirm(t('profile.eraseConfirm'))) return;
                const db = await getDb();
                await db.wipe();
                unlockApp();
                notifyChange();
              }}
            >
              {t('security.eraseAndReset')}
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('security.forgotBody')}</p>
      </Modal>
    </div>
  );
}

function fmt(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}
