import { create } from 'zustand';

/**
 * App-lock runtime state. Persistent settings (PIN hash, enabled flags, timeout) live in SQLite;
 * this store only tracks whether the UI is currently locked and when the app went to background.
 */
interface LockState {
  locked: boolean;
  backgroundedAt: number | null;
  /** Called once settings are known at startup. */
  initialize: (enabled: boolean) => void;
  lock: () => void;
  unlock: () => void;
  onBackground: () => void;
  /** Lock again if the app was in background for longer than `timeoutSec`. */
  onForeground: (enabled: boolean, timeoutSec: number, now?: number) => void;
}

export const useLockStore = create<LockState>((set, get) => ({
  locked: false,
  backgroundedAt: null,
  initialize: (enabled) => set({ locked: enabled }),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false, backgroundedAt: null }),
  onBackground: () => set({ backgroundedAt: Date.now() }),
  onForeground: (enabled, timeoutSec, now = Date.now()) => {
    const { backgroundedAt, locked } = get();
    if (!enabled || locked) return;
    if (backgroundedAt === null) return;
    if (now - backgroundedAt >= timeoutSec * 1000) set({ locked: true, backgroundedAt: null });
    else set({ backgroundedAt: null });
  },
}));
