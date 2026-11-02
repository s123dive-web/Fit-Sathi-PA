import { settingsRepo, stepsRepo } from '../db/repos';
import { todayISO } from '../utils/dates';
import { FitHealthConnect, type HealthConnectStatus } from '../native/plugins';
import { notifyChange } from '../store/appStore';

export interface StepsState {
  steps: number | null;
  status: HealthConnectStatus | 'permission_denied' | 'disabled';
}

/** Read today's steps if Health Connect is enabled, available and permitted. Never throws. */
export async function refreshSteps(): Promise<StepsState> {
  const settings = await settingsRepo.get();
  if (!settings.healthConnectEnabled) return { steps: null, status: 'disabled' };
  try {
    const avail = await FitHealthConnect.isAvailable();
    if (!avail.available) return { steps: null, status: avail.status };
    const perm = await FitHealthConnect.hasPermission();
    if (!perm.granted) return { steps: null, status: 'permission_denied' };
    const today = todayISO();
    const { steps } = await FitHealthConnect.readSteps({ date: today });
    await stepsRepo.set(today, steps, 'health_connect');
    notifyChange();
    return { steps, status: 'available' };
  } catch (e) {
    console.warn('Health Connect read failed', e);
    return { steps: null, status: 'unsupported' };
  }
}

export async function enableHealthConnect(): Promise<StepsState> {
  const avail = await FitHealthConnect.isAvailable();
  if (!avail.available) return { steps: null, status: avail.status };
  const perm = await FitHealthConnect.requestPermission();
  if (!perm.granted) return { steps: null, status: 'permission_denied' };
  await settingsRepo.set('healthConnectEnabled', true);
  return refreshSteps();
}

export async function disableHealthConnect(): Promise<void> {
  await settingsRepo.set('healthConnectEnabled', false);
  notifyChange();
}
