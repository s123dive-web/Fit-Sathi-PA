import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { ISODate, PendingNativeAction } from '../types';

/* ----------------------------- FitAlarms ----------------------------- */

export type AlarmKind = 'supplement' | 'workout' | 'habit' | 'water' | 'fasting' | 'motivation';
export type AlarmAction = 'done' | 'skip' | 'snooze' | 'add';

export interface AlarmSpec {
  id: string;
  kind: AlarmKind;
  refId: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  /** ISO weekdays 1..7; empty = every day */
  days: number[];
  actions: AlarmAction[];
  /** Use a user-visible alarm clock (AlarmManager.setAlarmClock) instead of a plain exact alarm. */
  alarmClock?: boolean;
  /** Full-screen intent + alarm sound + vibration (supplements, workout). */
  fullScreen?: boolean;
  /** One-shot on this local date (YYYY-MM-DD) instead of a recurring daily/weekday alarm. */
  date?: ISODate;
  /**
   * Exact delivery (AlarmManager.setExactAndAllowWhileIdle / setAlarmClock). Only supplements and the workout need it;
   * every other reminder is scheduled inexactly (setWindow) to respect battery and Play's exact-alarm policy.
   */
  exact?: boolean;
}

export interface PinnedItem {
  id: string;
  kind: 'habit' | 'supplement';
  title: string;
  done: boolean;
}

export interface FitAlarmsPlugin {
  canScheduleExactAlarms(): Promise<{ granted: boolean }>;
  requestExactAlarmPermission(): Promise<void>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  /** Replace the full set of scheduled alarms; persisted natively and restored on reboot. */
  syncAlarms(options: { alarms: AlarmSpec[] }): Promise<{ scheduled: number }>;
  /** Pinned, ongoing notification with tick buttons for today's habits. */
  updatePinned(options: { enabled: boolean; title: string; date: ISODate; items: PinnedItem[] }): Promise<void>;
  getPendingActions(): Promise<{ actions: PendingNativeAction[] }>;
  clearPendingActions(): Promise<void>;
  /** Atomically returns and clears the stored actions (no window in which a new action can be lost). */
  drainPendingActions(): Promise<{ actions: PendingNativeAction[] }>;
  /** Android 14+: full-screen intents need a user grant for non-alarm-clock apps. Always true below API 34. */
  canUseFullScreenIntent(): Promise<{ granted: boolean }>;
  requestFullScreenIntentPermission(): Promise<void>;
  /** Whether notifications can be posted at all (runtime permission on 13+, app-level toggle below). */
  areNotificationsEnabled(): Promise<{ granted: boolean }>;
  addListener(eventName: 'action', listener: (action: PendingNativeAction) => void): Promise<PluginListenerHandle>;
}

export const FitAlarms = registerPlugin<FitAlarmsPlugin>('FitAlarms', {
  web: () => import('./web').then((m) => new m.FitAlarmsWeb()),
});

/* ----------------------------- FitWidget ----------------------------- */

export interface WidgetItem {
  id: string;
  kind: 'habit' | 'supplement';
  emoji: string;
  title: string;
  done: boolean;
}

export interface FitWidgetPlugin {
  update(options: { date: ISODate; items: WidgetItem[]; waterMl: number; waterTargetMl: number; xpToday: number }): Promise<void>;
}

export const FitWidget = registerPlugin<FitWidgetPlugin>('FitWidget', {
  web: () => import('./web').then((m) => new m.FitWidgetWeb()),
});

/* ------------------------- FitHealthConnect -------------------------- */

export type HealthConnectStatus = 'available' | 'not_installed' | 'update_required' | 'unsupported';

export interface FitHealthConnectPlugin {
  isAvailable(): Promise<{ available: boolean; status: HealthConnectStatus }>;
  hasPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  readSteps(options: { date: ISODate }): Promise<{ steps: number }>;
}

export const FitHealthConnect = registerPlugin<FitHealthConnectPlugin>('FitHealthConnect', {
  web: () => import('./web').then((m) => new m.FitHealthConnectWeb()),
});

/* -------------------------- FitSecurePhotos -------------------------- */

export interface FitSecurePhotosPlugin {
  /** Encrypts and stores a JPEG (base64, no data: prefix) in app-private storage. */
  save(options: { base64: string }): Promise<{ key: string }>;
  load(options: { key: string }): Promise<{ base64: string }>;
  remove(options: { key: string }): Promise<void>;
}

export const FitSecurePhotos = registerPlugin<FitSecurePhotosPlugin>('FitSecurePhotos', {
  web: () => import('./web').then((m) => new m.FitSecurePhotosWeb()),
});

/* ----------------------------- FitBackup ----------------------------- */

export interface FitBackupPlugin {
  /** Opens the system "Create document" picker (user can choose Google Drive) and writes the data. */
  saveDocument(options: { filename: string; mimeType: string; data: string }): Promise<{ saved: boolean }>;
  /** Opens the system document picker and returns the file's text. */
  openDocument(options: { mimeTypes: string[] }): Promise<{ data: string | null; name: string | null }>;
}

export const FitBackup = registerPlugin<FitBackupPlugin>('FitBackup', {
  web: () => import('./web').then((m) => new m.FitBackupWeb()),
});

/* ---------------------------- FitBiometric ---------------------------- */

export type BiometricStatus = 'available' | 'none_enrolled' | 'no_hardware' | 'unavailable';

export interface FitBiometricPlugin {
  isAvailable(): Promise<{ available: boolean; status: BiometricStatus }>;
  /** Shows the system fingerprint / face prompt. Resolves { success: false, reason } on cancel or failure. */
  authenticate(options: { title: string; subtitle?: string; negativeButton?: string }): Promise<{ success: boolean; reason?: string }>;
}

export const FitBiometric = registerPlugin<FitBiometricPlugin>('FitBiometric', {
  web: () => import('./web').then((m) => new m.FitBiometricWeb()),
});
