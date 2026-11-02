import { useEffect, useState } from 'react';
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

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'success' | 'error';
}

interface AppState {
  revision: number;
  xpBurst: XpBurst | null;
  confetti: Confetti | null;
  toast: Toast | null;
  notifyChange: () => void;
  showXp: (amount: number, x?: number, y?: number) => void;
  celebrate: (label: string) => void;
  toastMsg: (message: string, kind?: Toast['kind']) => void;
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
  toastMsg: (message, kind = 'info') => {
    const t: Toast = { id: Date.now(), message, kind };
    set({ toast: t });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set((s) => (s.toast?.id === t.id ? { toast: null } : {})), 2600);
  },
}));

// Imperative helpers for services (outside React).
export const notifyChange = (): void => useAppStore.getState().notifyChange();
export const showXp = (amount: number, x?: number, y?: number): void => useAppStore.getState().showXp(amount, x, y);
export const celebrate = (label: string): void => useAppStore.getState().celebrate(label);
export const toast = (message: string, kind: Toast['kind'] = 'info'): void => useAppStore.getState().toastMsg(message, kind);

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
