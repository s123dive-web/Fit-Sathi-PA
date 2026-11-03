import { useEffect, useState } from 'react';
import { Modal } from './ui';
import { PinPad } from './PinPad';
import { attemptPin } from '../services/security';
import { toast } from '../store/appStore';
import { t, tn } from '../i18n';

type Mode = 'set' | 'verify' | 'change';
type Stage = 'verify' | 'enter' | 'confirm';

/**
 * set:    enter → confirm → onDone(pin)
 * verify: enter current PIN (with cooldown handling) → onDone(pin)
 * change: verify current → enter new → confirm new → onDone(newPin) — one dialog, no timer chains.
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
  const firstStage: Stage = mode === 'set' ? 'enter' : 'verify';
  const [stage, setStage] = useState<Stage>(firstStage);
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStage(mode === 'set' ? 'enter' : 'verify');
      setFirst('');
      setError(null);
      setBusy(false);
    }
  }, [open, mode]);

  const close = () => {
    if (busy) return;
    setStage(firstStage);
    setFirst('');
    setError(null);
    onClose();
  };

  const fail = (msg: string) => {
    setError(msg);
    setShake((s) => s + 1);
  };

  const finish = async (pin: string) => {
    setBusy(true);
    try {
      await onDone(pin);
      setBusy(false);
      close();
    } catch (e) {
      toast(t('security.pinSaveFailed', { msg: e instanceof Error ? e.message : String(e) }), 'error');
      fail(t('security.pinSaveFailed', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const complete = async (pin: string) => {
    if (busy) return;
    if (stage === 'verify') {
      setBusy(true);
      let r: Awaited<ReturnType<typeof attemptPin>>;
      try {
        r = await attemptPin(pin);
      } finally {
        setBusy(false);
      }
      if (r.ok) {
        setError(null);
        if (mode === 'verify') {
          await finish(pin);
          return;
        }
        setStage('enter');
        setReset((x) => x + 1);
        return;
      }
      fail(
        r.reason === 'no_pin'
          ? t('security.noPin')
          : r.lockedForSec
            ? t('security.lockedOut', { s: `${r.lockedForSec}s` })
            : `${t('security.wrongPin')} · ${tn('security.attemptsLeft', r.attemptsLeft)}`,
      );
      return;
    }
    if (stage === 'enter') {
      setFirst(pin);
      setStage('confirm');
      setError(null);
      setReset((r) => r + 1);
      return;
    }
    if (pin !== first) {
      fail(t('security.pinMismatch'));
      setStage('enter');
      setFirst('');
      return;
    }
    await finish(pin);
  };

  const heading =
    title ??
    (mode === 'verify'
      ? t('security.currentPinTitle')
      : mode === 'change'
        ? stage === 'verify'
          ? t('security.changePinVerify')
          : stage === 'enter'
            ? t('security.changePinNew')
            : t('security.changePinConfirm')
        : stage === 'enter'
          ? t('security.setPinTitle')
          : t('security.confirmPinTitle'));

  return (
    <Modal open={open} onClose={close} title={heading}>
      <div className="py-2">
        <PinPad onComplete={(p) => void complete(p)} error={error} disabled={busy} resetKey={`${stage}-${reset}`} shakeKey={shake} />
      </div>
    </Modal>
  );
}
