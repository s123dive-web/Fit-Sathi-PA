import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Tiny external store: a global revision counter that bumps after every write,
 * plus a few UI-level values. Screens re-query SQLite when the revision changes.
 */
type Listener = () => void;

interface UiState {
  revision: number;
  xpBurst: { id: number; amount: number; x: number; y: number } | null;
  toast: { id: number; message: string; kind: 'info' | 'success' | 'error' } | null;
}

let state: UiState = { revision: 0, xpBurst: null, toast: null };
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function notifyChange(): void {
  state = { ...state, revision: state.revision + 1 };
  emit();
}

export function showXp(amount: number, x?: number, y?: number): void {
  state = {
    ...state,
    xpBurst: { id: Date.now(), amount, x: x ?? window.innerWidth / 2, y: y ?? window.innerHeight / 2 },
  };
  emit();
  setTimeout(() => {
    state = { ...state, xpBurst: null };
    emit();
  }, 950);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
  state = { ...state, toast: { id: Date.now(), message, kind } };
  emit();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    state = { ...state, toast: null };
    emit();
  }, 2600);
}

export function useUiState(): UiState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function useRevision(): number {
  return useSyncExternalStore(subscribe, () => state.revision, () => state.revision);
}

/** Run an async loader whenever the global revision (or extra deps) change. */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
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
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
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
