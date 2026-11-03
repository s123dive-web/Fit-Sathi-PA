import { useEffect, useState } from 'react';
import { PIN_LENGTH } from '../utils/pin';
import { tapHaptic } from '../utils/haptics';
import { t } from '../i18n';

/**
 * Numeric keypad with 4 dots. Calls onComplete when PIN_LENGTH digits are entered.
 * `error` is displayed; bump `shakeKey` to shake the dots and clear the entry (once per wrong attempt,
 * independent of the error text, which may tick every second during a cooldown).
 */
export function PinPad({
  onComplete,
  error,
  disabled,
  extraKey,
  resetKey,
  shakeKey,
}: {
  onComplete: (pin: string) => void;
  error?: string | null;
  disabled?: boolean;
  /** Optional bottom-left key (e.g. fingerprint). */
  extraKey?: { label: string; icon: string; onPress: () => void };
  /** Change to clear the entered digits. */
  resetKey?: unknown;
  /** Increment to shake the dots (wrong attempt). */
  shakeKey?: number;
}) {
  const [digits, setDigits] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setDigits('');
  }, [resetKey]);

  useEffect(() => {
    if (!shakeKey) return;
    setShake(true);
    setDigits('');
    const id = setTimeout(() => setShake(false), 450);
    return () => clearTimeout(id);
  }, [shakeKey]);

  const press = (d: string) => {
    if (disabled || digits.length >= PIN_LENGTH) return;
    void tapHaptic();
    const next = digits + d;
    setDigits(next);
    if (next.length === PIN_LENGTH) setTimeout(() => onComplete(next), 80);
  };
  const back = () => {
    void tapHaptic();
    setDigits((d) => d.slice(0, -1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits, disabled]);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="mx-auto w-full max-w-xs select-none">
      <div
        className={`mb-6 flex justify-center gap-4 ${shake ? 'animate-shake' : ''}`}
        aria-label={t('security.digitsEntered', { n: digits.length, total: PIN_LENGTH })}
        role="status"
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            data-testid="pin-dot"
            className={`h-4 w-4 rounded-full border-2 transition ${i < digits.length ? (error ? 'border-rose-500 bg-rose-500' : 'border-brand-600 bg-brand-600') : 'border-slate-300 dark:border-slate-600'}`}
          />
        ))}
      </div>
      {error && (
        <p className="mb-3 text-center text-sm font-medium text-rose-600" role="alert">
          {error}
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} disabled={disabled} />
        ))}
        {extraKey ? (
          <button
            type="button"
            className="btn-ghost h-14 flex-col gap-0 text-2xl sm:h-16"
            onClick={extraKey.onPress}
            aria-label={extraKey.label}
            disabled={disabled}
          >
            <span aria-hidden="true">{extraKey.icon}</span>
          </button>
        ) : (
          <span />
        )}
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <button
          type="button"
          className="btn-ghost h-14 text-xl sm:h-16"
          onClick={back}
          aria-label={t('security.delete')}
          disabled={disabled || digits.length === 0}
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

function Key({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="btn-ghost h-14 text-2xl font-semibold sm:h-16" onClick={onPress} disabled={disabled} aria-label={label}>
      {label}
    </button>
  );
}
