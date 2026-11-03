import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { photoRepo, pointsRepo } from '../db/repos';
import { FitSecurePhotos } from '../native/plugins';
import { nowIso, todayISO } from '../utils/dates';
import { XP } from '../utils/xp';
import { notifyChange, showXp } from '../store/appStore';
import type { ProgressPhoto } from '../types';

/** Small LRU of decoded data URLs; full-size photos are ~1 MB each, so keep at most a screenful. */
const MAX_CACHE = 24;
const cache = new Map<string, string>();

function remember(path: string, url: string): void {
  cache.delete(path);
  cache.set(path, url);
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function clearPhotoCache(): void {
  cache.clear();
}

/** Capture with the camera, encrypt, store privately; nothing leaves the device. */
export async function captureProgressPhoto(weightKg: number | null, note: string, source: 'camera' | 'gallery' = 'camera'): Promise<ProgressPhoto | null> {
  const photo = await Camera.getPhoto({
    quality: 80,
    width: 1280,
    resultType: CameraResultType.Base64,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
    correctOrientation: true,
    saveToGallery: false,
  });
  if (!photo.base64String) return null;
  const { key } = await FitSecurePhotos.save({ base64: photo.base64String });
  const date = todayISO();
  const rec = await photoRepo.add({ date, path: key, takenAt: nowIso(), weightKg, note });
  await pointsRepo.add(date, XP.photoAdded, `photo:${rec.id}`);
  showXp(XP.photoAdded);
  notifyChange();
  return rec;
}

export async function loadPhotoDataUrl(path: string): Promise<string> {
  const cached = cache.get(path);
  if (cached) {
    remember(path, cached); // bump recency
    return cached;
  }
  const { base64 } = await FitSecurePhotos.load({ key: path });
  const url = `data:image/jpeg;base64,${base64}`;
  remember(path, url);
  return url;
}

export async function deletePhoto(p: ProgressPhoto): Promise<void> {
  await FitSecurePhotos.remove({ key: p.path }).catch(() => undefined);
  await photoRepo.remove(p.id);
  await pointsRepo.revoke(p.date, `photo:${p.id}`);
  cache.delete(p.path);
  notifyChange();
}
