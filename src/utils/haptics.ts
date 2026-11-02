import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/** Haptic feedback helpers; silently no-op where unsupported (web). */
export async function tapHaptic(): Promise<void> {
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* unsupported */
  }
}

export async function successHaptic(): Promise<void> {
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* unsupported */
  }
}
