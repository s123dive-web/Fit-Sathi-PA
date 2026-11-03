import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { HHMM, Weekday } from '../types';
import { isValidHHMM, weekdayToDayName } from '../utils/dates';
import { toast as showToast, useAppStore } from '../store/appStore';
import { t } from '../i18n';

export function Card({ children, className = '', title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string | null }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-medium text-rose-600 dark:text-rose-300">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex h-12 w-14 shrink-0 items-center justify-center disabled:opacity-40"
    >
      <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

/** Time input that ignores a cleared/invalid value and says so instead of silently keeping the old one. */
export function TimeInput({ value, onChange, label }: { value: HHMM; onChange: (v: HHMM) => void; label?: string }) {
  const [ignored, setIgnored] = useState(false);
  return (
    <span className="block">
      <input
        type="time"
        className="input"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const v = e.target.value;
          if (isValidHHMM(v)) {
            setIgnored(false);
            onChange(v);
          } else {
            setIgnored(true);
          }
        }}
        onBlur={() => setIgnored(false)}
      />
      {ignored && <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">{t('common.timeIgnored', { time: formatTimeSafe(value) })}</span>}
    </span>
  );
}

function formatTimeSafe(v: HHMM): string {
  return isValidHHMM(v) ? v : '—';
}

export function WeekdayPicker({ value, onChange }: { value: Weekday[]; onChange: (v: Weekday[]) => void }) {
  const days: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="flex gap-1" role="group" aria-label={t('form.days')}>
      {days.map((d) => {
        const on = value.includes(d);
        const name = t(`days.${weekdayToDayName(d)}`);
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={name}
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={`h-12 flex-1 rounded-lg text-xs font-medium ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {name.slice(0, 2)}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 64,
  stroke = 7,
  color = '#22a566',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-slate-200 dark:text-slate-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: 'stroke-dasharray 400ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** Stack of open modals so only the topmost one reacts to Escape / Tab. */
const modalStack: symbol[] = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  /** Called for the close button, the backdrop and Escape. Wrap it to ask before discarding a dirty draft. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = Symbol('modal');
    modalStack.push(id);
    const opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const focusInitial = () => {
      if (!panel) return;
      if (panel.contains(document.activeElement) && document.activeElement !== panel) return;
      const auto = panel.querySelector<HTMLElement>('[autofocus]');
      const f = focusables();
      (auto ?? f.find((el) => !el.hasAttribute('data-modal-close')) ?? f[0] ?? panel).focus();
    };
    const raf = requestAnimationFrame(focusInitial);
    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const f = focusables();
      if (f.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      modalStack.splice(modalStack.indexOf(id), 1);
      document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose} data-testid="modal-backdrop">
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl outline-none dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
          <h3 id={titleId} className="text-base font-semibold">
            {title}
          </h3>
          <button className="btn-ghost h-11 w-11 rounded-full p-0" onClick={onClose} aria-label={t('common.close')} data-modal-close>
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && (
          <div
            className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-5 pt-3 dark:border-slate-800 dark:bg-slate-900 sm:rounded-b-3xl"
            style={{ paddingBottom: 'calc(0.75rem + var(--safe-bottom))' }}
          >
            {footer}
          </div>
        )}
        {!footer && <div style={{ height: 'var(--safe-bottom)' }} />}
      </div>
    </div>
  );
}

/**
 * In-app replacement for window.confirm. `holdMs` requires the pointer to be held on the confirm button
 * (keyboard activation confirms directly so it stays accessible); `typedWord` requires typing that word first.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  destructive = true,
  holdMs,
  typedWord,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  holdMs?: number;
  typedWord?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [holdPct, setHoldPct] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef(0);

  useEffect(() => {
    if (!open) {
      setTyped('');
      setHoldPct(0);
      setBusy(false);
    }
  }, [open]);

  const armed = !typedWord || typed.trim().toUpperCase() === typedWord.toUpperCase();

  const confirm = async () => {
    if (busy || !armed) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      showToast(t('common.actionFailed', { msg: e instanceof Error ? e.message : String(e) }), 'error');
    } finally {
      setBusy(false);
    }
  };

  const stopHold = () => {
    if (holdTimer.current) clearInterval(holdTimer.current);
    holdTimer.current = null;
    setHoldPct(0);
  };
  const startHold = () => {
    if (!armed || busy || !holdMs) return;
    holdStart.current = Date.now();
    stopHold();
    holdTimer.current = setInterval(() => {
      const pct = Math.min(1, (Date.now() - holdStart.current) / holdMs);
      setHoldPct(pct);
      if (pct >= 1) {
        stopHold();
        void confirm();
      }
    }, 40);
  };
  useEffect(() => () => stopHold(), []);

  const btnClass = destructive ? 'btn-danger' : 'btn-primary';
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          {holdMs ? (
            <button
              className={`${btnClass} relative min-w-[9rem] overflow-hidden select-none`}
              disabled={!armed || busy}
              onPointerDown={startHold}
              onPointerUp={stopHold}
              onPointerLeave={stopHold}
              onPointerCancel={stopHold}
              onContextMenu={(e) => e.preventDefault()}
              onClick={(e) => {
                // Keyboard / assistive tech activation (detail === 0) confirms without holding.
                if (e.detail === 0) void confirm();
              }}
              aria-label={`${confirmLabel} — ${t('common.holdToConfirm')}`}
            >
              <span className="absolute inset-y-0 left-0 bg-black/25 transition-none" style={{ width: `${holdPct * 100}%` }} aria-hidden="true" />
              <span className="relative">{busy ? t('common.saving') : holdPct > 0 ? t('common.keepHolding') : confirmLabel}</span>
            </button>
          ) : (
            <button className={btnClass} disabled={!armed || busy} onClick={() => void confirm()}>
              {busy ? t('common.saving') : confirmLabel}
            </button>
          )}
        </>
      }
    >
      {typeof body === 'string' ? <p className="text-sm text-slate-600 dark:text-slate-300">{body}</p> : body}
      {typedWord && (
        <label className="mt-3 block">
          <span className="label">{t('common.typeToConfirm', { word: typedWord })}</span>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" autoFocus />
        </label>
      )}
      {holdMs && !typedWord && <p className="mt-2 text-xs text-slate-500">{t('common.holdToConfirm')}</p>}
    </Modal>
  );
}

/** Shown when a screen's loader rejected: message + retry. */
export function ErrorCard({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  return (
    <div className="card mx-auto max-w-lg" role="alert">
      <div className="font-semibold">{t('errors.loadFailed')}</div>
      {message && <p className="mt-1 break-words text-xs text-slate-500">{message}</p>}
      <button className="btn-primary mt-3 w-full" onClick={onRetry}>
        {t('errors.retry')}
      </button>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function EmptyState({ emoji, title, body, action }: { emoji: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center py-8 text-center">
      <div className="text-4xl" aria-hidden="true">
        {emoji}
      </div>
      <div className="mt-2 font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-xs text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const CONFETTI_COLORS = ['#22a566', '#f97316', '#8b5cf6', '#0ea5e9', '#eab308', '#e11d48'];

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Where to anchor the XP burst for a click: the pointer position, or the control's centre when the event
 * came from the keyboard / assistive tech (clientX/Y are 0 then).
 */
export function eventAnchor(e: { clientX: number; clientY: number; currentTarget: Element | null }): { x: number; y: number } {
  if (e.clientX || e.clientY) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget?.getBoundingClientRect();
  if (r) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/** Floating "+10 XP" burst, milestone confetti and toast, driven by the global store. */
export function Overlays() {
  const xpBurst = useAppStore((s) => s.xpBurst);
  const confetti = useAppStore((s) => s.confetti);
  const toast = useAppStore((s) => s.toast);
  const dismissToast = useAppStore((s) => s.dismissToast);
  const reduced = prefersReducedMotion();
  return (
    <>
      {confetti && (
        <div key={confetti.id} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-live="polite">
          {!reduced &&
            Array.from({ length: 60 }).map((_, i) => (
              <span
                key={i}
                className="confetti-piece"
                aria-hidden="true"
                style={{
                  left: `${(i * 37) % 100}%`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  animationDelay: `${(i % 10) * 60}ms`,
                  animationDuration: `${1800 + (i % 7) * 150}ms`,
                  transform: `rotate(${(i * 53) % 360}deg)`,
                }}
              />
            ))}
          <div className="absolute inset-x-0 top-1/3 flex justify-center">
            <div className="rounded-2xl bg-white/95 px-5 py-3 text-lg font-bold text-slate-900 shadow-xl dark:bg-slate-800 dark:text-white">
              {confetti.label}
            </div>
          </div>
        </div>
      )}
      {xpBurst && (
        <div
          key={xpBurst.id}
          className="pointer-events-none fixed z-50 animate-xp-pop rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-amber-950 shadow-lg"
          style={{ left: xpBurst.x - 28, top: xpBurst.y - 40 }}
          aria-hidden="true"
        >
          {t('common.xpGain', { n: xpBurst.amount })}
        </div>
      )}
      <div role="status" aria-live="polite" className="contents">
        {toast && (
          <div
            key={toast.id}
            className={`fixed left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${
              toast.kind === 'success' ? 'bg-brand-600' : toast.kind === 'error' ? 'bg-rose-600' : 'bg-slate-800'
            }`}
            style={{ bottom: 'calc(5.5rem + var(--safe-bottom))' }}
          >
            <span className="min-w-0">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="min-h-[44px] shrink-0 rounded-full px-2 font-semibold underline underline-offset-2"
                onClick={() => {
                  dismissToast();
                  toast.action?.onClick();
                }}
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** Tick button with bounce animation; reports click position so the XP burst appears next to it. */
export function TickButton({
  done,
  onClick,
  color = '#22a566',
  size = 48,
  label,
  disabled,
}: {
  done: boolean;
  onClick: (anchor: { x: number; y: number }) => void;
  color?: string;
  size?: number;
  label?: string;
  disabled?: boolean;
}) {
  const [bounce, setBounce] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!bounce) return;
    const t = setTimeout(() => setBounce(false), 320);
    return () => clearTimeout(t);
  }, [bounce]);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label ?? (done ? t('common.markNotDone') : t('common.markDone'))}
      data-testid="tick"
      aria-pressed={done}
      aria-busy={disabled || undefined}
      disabled={disabled}
      onClick={() => {
        setBounce(true);
        const r = ref.current?.getBoundingClientRect();
        onClick({ x: r ? r.left + r.width / 2 : window.innerWidth / 2, y: r ? r.top : window.innerHeight / 2 });
      }}
      className={`flex shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-60 ${bounce ? 'animate-tick-bounce' : ''}`}
      style={{
        width: size,
        height: size,
        borderColor: color,
        background: done ? color : 'transparent',
        color: done ? 'white' : color,
      }}
    >
      {done ? (
        <svg
          width={size * 0.5}
          height={size * 0.5}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </button>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10" role="status" aria-label={t('common.loading')}>
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
    </div>
  );
}
