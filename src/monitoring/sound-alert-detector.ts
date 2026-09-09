export type SoundAlertDetectorState = {
  loudSince: number | null;
  lastAlertAt: number | null;
};

export type SoundAlertDetectorConfig = {
  threshold: number;
  sustainedForMs: number;
  cooldownMs: number;
};

export const SOUND_ALERT_SENSITIVITIES = ['low', 'standard', 'high'] as const;

export type SoundAlertSensitivity = (typeof SOUND_ALERT_SENSITIVITIES)[number];

const DEFAULT_SOUND_ALERT_CONFIG: SoundAlertDetectorConfig = {
  threshold: 0.12,
  sustainedForMs: 1_200,
  cooldownMs: 60_000,
};

const SOUND_ALERT_CONFIGS: Record<SoundAlertSensitivity, SoundAlertDetectorConfig> = {
  low: {
    threshold: 0.2,
    sustainedForMs: 1_800,
    cooldownMs: 60_000,
  },
  standard: DEFAULT_SOUND_ALERT_CONFIG,
  high: {
    threshold: 0.06,
    sustainedForMs: 800,
    cooldownMs: 60_000,
  },
};

export function isSoundAlertSensitivity(value: unknown): value is SoundAlertSensitivity {
  return SOUND_ALERT_SENSITIVITIES.some((sensitivity) => sensitivity === value);
}

export function soundAlertConfigForSensitivity(
  sensitivity: SoundAlertSensitivity,
): SoundAlertDetectorConfig {
  return SOUND_ALERT_CONFIGS[sensitivity];
}

export function createSoundAlertDetectorState(): SoundAlertDetectorState {
  return { loudSince: null, lastAlertAt: null };
}

export function advanceSoundAlertDetector(
  state: SoundAlertDetectorState,
  volume: number,
  now: number,
  config: SoundAlertDetectorConfig = DEFAULT_SOUND_ALERT_CONFIG,
): { state: SoundAlertDetectorState; shouldNotify: boolean } {
  if (!Number.isFinite(volume) || volume < config.threshold) {
    return { state: { ...state, loudSince: null }, shouldNotify: false };
  }

  const cooldownActive =
    state.lastAlertAt !== null && now - state.lastAlertAt < config.cooldownMs;
  if (cooldownActive) {
    return { state: { ...state, loudSince: null }, shouldNotify: false };
  }

  const loudSince = state.loudSince ?? now;
  if (now - loudSince < config.sustainedForMs) {
    return { state: { ...state, loudSince }, shouldNotify: false };
  }

  return {
    state: { loudSince: null, lastAlertAt: now },
    shouldNotify: true,
  };
}
