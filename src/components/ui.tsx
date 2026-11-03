import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { HHMM, Weekday } from '../types';
import { WEEKDAY_LABELS } from '../utils/dates';
import { useAppStore } from '../store/appStore';
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

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-12 w-14 shrink-0 items-center justify-center"
    >
      <span className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

export function TimeInput({ value, onChange }: { value: HHMM; onChange: (v: HHMM) => void }) {
  return <input type="time" className="input" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />;
}

export function WeekdayPicker({ value, onChange }: { value: Weekday[]; onChange: (v: Weekday[]) => void }) {
  const days: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="flex gap-1">
      {days.map((d) => {
        const on = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== d) : [...value, d].sort())}
            className={`h-12 flex-1 rounded-lg text-xs font-medium ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {WEEKDAY_LABELS[d].slice(0, 2)}
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
      <svg width={size} height={size} className="-rotate-90">
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

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <button className="btn-ghost h-11 w-11 rounded-full p-0" onClick={onClose} aria-label={t('common.close')}>
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
      <div className="text-4xl">{emoji}</div>
      <div className="mt-2 font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-xs text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const CONFETTI_COLORS = ['#22a566', '#f97316', '#8b5cf6', '#0ea5e9', '#eab308', '#e11d48'];

/** Floating "+10 XP" burst, milestone confetti and toast, driven by the global store. */
export function Overlays() {
  const xpBurst = useAppStore((s) => s.xpBurst);
  const confetti = useAppStore((s) => s.confetti);
  const toast = useAppStore((s) => s.toast);
  return (
    <>
      {confetti && (
        <div key={confetti.id} className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-live="polite">
          {Array.from({ length: 60 }).map((_, i) => (
            <span
              key={i}
              className="confetti-piece"
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
        >
          +{xpBurst.amount} XP
        </div>
      )}
      {toast && (
        <div
          key={toast.id}
          className={`fixed left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg ${
            toast.kind === 'success' ? 'bg-brand-600' : toast.kind === 'error' ? 'bg-rose-600' : 'bg-slate-800'
          }`}
          style={{ bottom: 'calc(5.5rem + var(--safe-bottom))' }}
        >
          {toast.message}
        </div>
      )}
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
}: {
  done: boolean;
  onClick: (anchor: { x: number; y: number }) => void;
  color?: string;
  size?: number;
  label?: string;
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
      onClick={() => {
        setBounce(true);
        const r = ref.current?.getBoundingClientRect();
        onClick({ x: r ? r.left + r.width / 2 : window.innerWidth / 2, y: r ? r.top : window.innerHeight / 2 });
      }}
      className={`flex shrink-0 items-center justify-center rounded-full border-2 transition ${bounce ? 'animate-tick-bounce' : ''}`}
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
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </button>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
    </div>
  );
}
