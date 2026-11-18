import { getDb } from '../db/database';
import { photoRepo } from '../db/repos';
import { FitAlarms, FitSecurePhotos, FitWidget } from '../native/plugins';
import { useLockStore } from '../store/lockStore';
import { notifyChange } from '../store/appStore';
import { todayISO } from '../utils/dates';
import { clearPhotoCache } from './photos';

/**
 * Erase everything: the local database, scheduled alarms, the pinned notification and the widget snapshot.
 * Used by Profile → "Erase all data" and by the lock screen's "Forgot PIN?" (there is no account to recover with).
 * Encrypted photo files are deleted first, while their rows still say where they are.
 */
export async function eraseAllData(): Promise<void> {
  const db = await getDb();
  const photos = await photoRepo.all().catch(() => []);
  await Promise.allSettled(photos.map((p) => FitSecurePhotos.remove({ key: p.path })));
  await db.wipe();
  clearPhotoCache();
  await Promise.allSettled([
    FitAlarms.syncAlarms({ alarms: [] }),
    FitAlarms.updatePinned({ enabled: false, title: '', date: todayISO(), items: [] }),
    FitWidget.update({ date: todayISO(), items: [], waterMl: 0, waterTargetMl: 0, xpToday: 0 }),
    FitAlarms.clearPendingActions(),
  ]);
  useLockStore.getState().unlock();
  notifyChange();
}
