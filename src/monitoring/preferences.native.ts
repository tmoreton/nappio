import * as SecureStore from 'expo-secure-store';

import {
  isSoundAlertSensitivity,
  type SoundAlertSensitivity,
} from '@/monitoring/sound-alert-detector';

const SOUND_ALERT_SENSITIVITY_KEY = 'nappio.sound-alert-sensitivity.v1';

export async function loadSoundAlertSensitivity(): Promise<SoundAlertSensitivity> {
  const stored = await SecureStore.getItemAsync(SOUND_ALERT_SENSITIVITY_KEY);
  return isSoundAlertSensitivity(stored) ? stored : 'standard';
}

export async function saveSoundAlertSensitivity(
  sensitivity: SoundAlertSensitivity,
): Promise<void> {
  await SecureStore.setItemAsync(SOUND_ALERT_SENSITIVITY_KEY, sensitivity, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}
