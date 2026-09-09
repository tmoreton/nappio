import type { SoundAlertSensitivity } from '@/monitoring/sound-alert-detector';

export async function loadSoundAlertSensitivity(): Promise<SoundAlertSensitivity> {
  return 'standard';
}

export async function saveSoundAlertSensitivity(
  _sensitivity: SoundAlertSensitivity,
): Promise<void> {}
