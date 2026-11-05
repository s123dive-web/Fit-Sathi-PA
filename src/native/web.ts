/**
 * Web fallbacks for the native plugins. These keep `npm run dev` fully usable in a browser:
 * - alarms become in-page timers + Notification API while the tab is open
 * - photos are AES-GCM encrypted with WebCrypto and stored in IndexedDB
 * - backup uses download / file picker
 * - Health Connect is reported as unsupported
 */
import { WebPlugin } from '@capacitor/core';
import type { ISODate, PendingNativeAction } from '../types';
import type {
  AlarmSpec,
  FitAlarmsPlugin,
  FitBackupPlugin,
  FitBiometricPlugin,
  FitHealthConnectPlugin,
  FitSecurePhotosPlugin,
  FitWidgetPlugin,
  PinnedItem,
  WidgetItem,
} from './plugins';

const PENDING_KEY = 'fitsaathi.pendingActions';

export class FitAlarmsWeb extends WebPlugin implements FitAlarmsPlugin {
  private timers: ReturnType<typeof setTimeout>[] = [];

  async canScheduleExactAlarms() {
    return { granted: true };
  }
  async requestExactAlarmPermission() {
    /* nothing to do on web */
  }
  async requestNotificationPermission() {
    if (typeof Notification === 'undefined') return { granted: false };
    if (Notification.permission === 'granted') return { granted: true };
    const r = await Notification.requestPermission();
    return { granted: r === 'granted' };
  }
  async syncAlarms(options: { alarms: AlarmSpec[] }) {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    const now = new Date();
    for (const a of options.alarms) {
      const next = nextOccurrence(a, now);
      const delay = next.getTime() - now.getTime();
      if (delay > 0 && delay < 24 * 3600 * 1000) {
        this.timers.push(
          setTimeout(() => {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(a.title, { body: a.body, tag: a.id });
            }
          }, delay),
        );
      }
    }
    return { scheduled: options.alarms.length };
  }
  async updatePinned(_options: { enabled: boolean; title: string; date: ISODate; items: PinnedItem[] }) {
    /* no persistent notification on web */
  }
  async getPendingActions() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return { actions: raw ? (JSON.parse(raw) as PendingNativeAction[]) : [] };
    } catch {
      return { actions: [] };
    }
  }
  async clearPendingActions() {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  }
  async drainPendingActions() {
    const r = await this.getPendingActions();
    await this.clearPendingActions();
    return r;
  }
  async canUseFullScreenIntent() {
    return { granted: true };
  }
  async requestFullScreenIntentPermission() {
    /* nothing to do on web */
  }
  async areNotificationsEnabled() {
    return { granted: typeof Notification !== 'undefined' && Notification.permission === 'granted' };
  }
}

export function nextOccurrence(a: AlarmSpec, from: Date): Date {
  if (a.date) {
    const [y, m, d] = a.date.split('-').map(Number);
    return new Date(y, m - 1, d, a.hour, a.minute, 0, 0);
  }
  for (let i = 0; i < 8; i += 1) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i, a.hour, a.minute, 0, 0);
    const iso = d.getDay() === 0 ? 7 : d.getDay();
    if (a.days.length && !a.days.includes(iso)) continue;
    if (d.getTime() > from.getTime()) return d;
  }
  return new Date(from.getTime() + 86_400_000);
}

export class FitWidgetWeb extends WebPlugin implements FitWidgetPlugin {
  async update(_options: { date: ISODate; items: WidgetItem[]; waterMl: number; waterTargetMl: number; xpToday: number }) {
    /* no widget on web */
  }
}

export class FitHealthConnectWeb extends WebPlugin implements FitHealthConnectPlugin {
  async isAvailable() {
    return { available: false, status: 'unsupported' as const };
  }
  async hasPermission() {
    return { granted: false };
  }
  async requestPermission() {
    return { granted: false };
  }
  async readSteps() {
    return { steps: 0 };
  }
}

/* ------------------------- encrypted photo store (web) ------------------------- */

const IDB_NAME = 'fitsaathi-photos';
const STORE = 'blobs';
const KEY_STORE = 'keys';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOrCreateKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(db, KEY_STORE, 'master');
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await idbPut(db, KEY_STORE, 'master', key);
  return key;
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export class FitSecurePhotosWeb extends WebPlugin implements FitSecurePhotosPlugin {
  async save(options: { base64: string }) {
    const db = await openIdb();
    const key = await getOrCreateKey(db);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = b64ToBytes(options.base64);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const storageKey = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await idbPut(db, STORE, storageKey, { iv: Array.from(iv), cipher: new Uint8Array(cipher) });
    return { key: storageKey };
  }
  async load(options: { key: string }) {
    const db = await openIdb();
    const key = await getOrCreateKey(db);
    const rec = await idbGet<{ iv: number[]; cipher: Uint8Array }>(db, STORE, options.key);
    if (!rec) throw new Error('Photo not found');
    const cipherBuf = new Uint8Array(new ArrayBuffer(rec.cipher.byteLength));
    cipherBuf.set(rec.cipher);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(rec.iv) }, key, cipherBuf);
    return { base64: bytesToB64(new Uint8Array(plain)) };
  }
  async remove(options: { key: string }) {
    const db = await openIdb();
    await idbDelete(db, STORE, options.key);
  }
}

export class FitBackupWeb extends WebPlugin implements FitBackupPlugin {
  async saveDocument(options: { filename: string; mimeType: string; data: string }) {
    const blob = new Blob([options.data], { type: options.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = options.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { saved: true };
  }
  async openDocument(options: { mimeTypes: string[] }) {
    return new Promise<{ data: string | null; name: string | null }>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = options.mimeTypes.join(',');
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve({ data: null, name: null });
        resolve({ data: await file.text(), name: file.name });
      };
      input.oncancel = () => resolve({ data: null, name: null });
      input.click();
    });
  }
}

export class FitBiometricWeb extends WebPlugin implements FitBiometricPlugin {
  async isAvailable() {
    return { available: false, status: 'unavailable' as const };
  }
  async authenticate() {
    return { success: false, reason: 'unavailable' };
  }
  async setSecureScreen(_options: { enabled: boolean }) {
    /* no screenshot protection on web */
  }
}
