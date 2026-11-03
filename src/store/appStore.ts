import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

/**
 * Zustand UI store. SQLite is the source of truth; `revision` bumps after every write and
 * screens re-query through `useAsyncData`. Also drives XP bursts, confetti and toasts.
 */
export interface XpBurst {
  id: number;
  amount: number;
  x: number;
  y: number;
}

export interface Confetti {
  id: number;
  label: string;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
  /** Optional action button (e.g. "Undo"). */
  action?: ToastAction;
}

export interface ToastOptions {
  action?: ToastAction;
  /** How long the toast stays, in ms (default 2600; 6000 when it carries an action). */
  durationMs?: number;
}

interface AppState {
  revision: number;
  xpBurst: XpBurst | null;
  confetti: Confetti | null;
  toast: Toast | null;
  notifyChange: () => void;
  showXp: (amount: number, x?: number, y?: number) => void;
  celebrate: (label: string) => void;
  toastMsg: (message: string, kind?: Toast['kind'], opts?: ToastOptions) => void;
  dismissToast: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>((set) => ({
  revision: 0,
  xpBurst: null,
  confetti: null,
  toast: null,
  notifyChange: () => set((s) => ({ revision: s.revision + 1 })),
  showXp: (amount, x, y) => {
    const burst: XpBurst = {
      id: Date.now(),
      amount,
      x: x ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 0),
      y: y ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 0),
    };
    set({ xpBurst: burst });
    setTimeout(() => set((s) => (s.xpBurst?.id === burst.id ? { xpBurst: null } : {})), 950);
  },
  celebrate: (label) => {
    const c: Confetti = { id: Date.now(), label };
    set({ confetti: c });
    setTimeout(() => set((s) => (s.confetti?.id === c.id ? { confetti: null } : {})), 2600);
  },
  toastMsg: (message, kind = 'info', opts = {}) => {
    const t: Toast = { id: Date.now() + Math.random(), message, kind, action: opts.action };
    set({ toast: t });
    if (toastTimer) clearTimeout(toastTimer);
    const duration = opts.durationMs ?? (opts.action ? 6000 : 2600);
    toastTimer = setTimeout(() => set((s) => (s.toast?.id === t.id ? { toast: null } : {})), duration);
  },
  dismissToast: () => {
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    set({ toast: null });
  },
}));

// Imperative helpers for services (outside React).
export const notifyChange = (): void => useAppStore.getState().notifyChange();
export const showXp = (amount: number, x?: number, y?: number): void => useAppStore.getState().showXp(amount, x, y);
export const celebrate = (label: string): void => useAppStore.getState().celebrate(label);
export const toast = (message: string, kind: Toast['kind'] = 'info', opts?: ToastOptions): void => useAppStore.getState().toastMsg(message, kind, opts);
export const dismissToast = (): void => useAppStore.getState().dismissToast();

export function useRevision(): number {
  return useAppStore((s) => s.revision);
}

export interface AsyncData<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Run an async loader whenever the global revision (or extra deps) change. */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncData<T> {
  const revision = useRevision();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loader()
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, tick, ...deps]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export interface PendingActions<T> {
  /** Optimistic value for a key while its action is in flight (undefined when idle). */
  get: (key: string) => T | undefined;
  has: (key: string) => boolean;
  /**
   * Run `action` for `key`, showing `optimistic` until the action resolves AND the data that
   * follows the revision bump has landed (so the UI never snaps back to the stale value).
   */
  run: (key: string, optimistic: T, action: () => Promise<void>) => Promise<void>;
}

/**
 * Per-item in-flight set for tap targets. Pass the screen's `data` so settled entries are released as
 * soon as the reload that followed the write arrives; a safety timeout releases them regardless.
 */
export function usePendingActions<T>(data: unknown, onError?: (e: unknown) => void): PendingActions<T> {
  const [map, setMap] = useState<Map<string, { value: T; settled: boolean }>>(() => new Map());
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    // New data landed: drop every entry whose action already finished.
    setMap((m) => {
      if (![...m.values()].some((e) => e.settled)) return m;
      const next = new Map(m);
      for (const [k, e] of next) if (e.settled) next.delete(k);
      return next;
    });
  }, [data]);

  const release = useCallback((key: string) => {
    setMap((m) => {
      if (!m.has(key)) return m;
      const next = new Map(m);
      next.delete(key);
      return next;
    });
  }, []);

  const run = useCallback(
    async (key: string, optimistic: T, action: () => Promise<void>) => {
      const startRevision = useAppStore.getState().revision;
      setMap((m) => new Map(m).set(key, { value: optimistic, settled: false }));
      try {
        await action();
      } catch (e) {
        onErrorRef.current?.(e);
        release(key);
        return;
      }
      if (useAppStore.getState().revision === startRevision) {
        // Nothing was written (or nothing re-queries): release immediately.
        release(key);
        return;
      }
      setMap((m) => {
        const cur = m.get(key);
        if (!cur) return m;
        return new Map(m).set(key, { ...cur, settled: true });
      });
      setTimeout(() => release(key), 3000);
    },
    [release],
  );

  return {
    get: (key) => map.get(key)?.value,
    has: (key) => map.has(key),
    run,
  };
}
