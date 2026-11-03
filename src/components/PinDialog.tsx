import { useState } from 'react';
import { Modal } from './ui';
import { PinPad } from './PinPad';
import { attemptPin } from '../services/security';
import { t } from '../i18n';

type Mode = 'set' | 'verify';

/**
 * set:    enter → confirm → onDone(pin)
 * verify: enter current PIN (with cooldown handling) → onDone(pin)
 */
export function PinDialog({
  open,
  mode,
  title,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: Mode;
  title?: string;
  onClose: () => void;
  onDone: (pin: string) => void | Promise<void>;
}) {
  const [stage, setStage] = useState<'enter' | 'confirm'>('enter');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setStage('enter');
    setFirst('');
    setError(null);
    onClose();
  };

  const complete = async (pin: string) => {
    if (mode === 'set') {
      if (stage === 'enter') {
        setFirst(pin);
        setStage('confirm');
        setError(null);
        setReset((r) => r + 1);
        return;
      }
      if (pin !== first) {
        setError(t('security.pinMismatch'));
        setStage('enter');
        setFirst('');
        return;
      }
      setBusy(true);
      await onDone(pin);
      setBusy(false);
      close();
      return;
    }
    setBusy(true);
    const r = await attemptPin(pin);
    setBusy(false);
    if (r.ok) {
      await onDone(pin);
      close();
      return;
    }
    setError(
      r.lockedForSec
        ? t('security.lockedOut', { s: `${r.lockedForSec}s` })
        : `${t('security.wrongPin')} · ${t('security.attemptsLeft', { n: r.attemptsLeft })}`,
    );
  };

  const heading = title ?? (mode === 'verify' ? t('security.currentPinTitle') : stage === 'enter' ? t('security.setPinTitle') : t('security.confirmPinTitle'));

  return (
    <Modal open={open} onClose={close} title={heading}>
      <div className="py-2">
        <PinPad onComplete={(p) => void complete(p)} error={error} disabled={busy} resetKey={`${stage}-${reset}`} />
      </div>
    </Modal>
  );
}
