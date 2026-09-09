export const BABY_DEVICE_STATUS_TOPIC = 'nappio.baby-device-status.v1';

export type BabyDeviceStatus = {
  batteryLevel: number | null;
  isCharging: boolean | null;
  lowPowerMode: boolean;
};

export type ReceivedBabyDeviceStatus = BabyDeviceStatus & {
  receivedAt: number;
};

export function encodeBabyDeviceStatus(status: BabyDeviceStatus): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify(status));
}

export function parseBabyDeviceStatus(payload: Uint8Array): BabyDeviceStatus | null {
  try {
    return parseBabyDeviceStatusValue(JSON.parse(new TextDecoder().decode(payload)));
  } catch {
    return null;
  }
}

export function parseBabyDeviceStatusValue(value: unknown): BabyDeviceStatus | null {
  if (!value || typeof value !== 'object') return null;
  const status = value as Partial<BabyDeviceStatus>;
  if (
    status.batteryLevel !== null &&
    (typeof status.batteryLevel !== 'number' ||
      !Number.isFinite(status.batteryLevel) ||
      status.batteryLevel < 0 ||
      status.batteryLevel > 1)
  ) {
    return null;
  }
  if (status.isCharging !== null && typeof status.isCharging !== 'boolean') return null;
  if (typeof status.lowPowerMode !== 'boolean') return null;
  return {
    batteryLevel: status.batteryLevel,
    isCharging: status.isCharging,
    lowPowerMode: status.lowPowerMode,
  };
}

export function isBabyBatteryLow(status: BabyDeviceStatus): boolean {
  return status.batteryLevel !== null && status.batteryLevel <= 0.2 && status.isCharging !== true;
}

export function formatBabyDeviceStatus(
  status: ReceivedBabyDeviceStatus,
  now: number,
): string {
  const parts = ['Baby phone'];
  if (status.batteryLevel !== null) {
    const percentage = Math.round(status.batteryLevel * 100);
    parts.push(status.isCharging ? `Charging · ${percentage}%` : `Battery · ${percentage}%`);
  } else if (status.isCharging) {
    parts.push('Charging');
  }
  if (status.lowPowerMode) parts.push('Low Power Mode');

  const ageSeconds = Math.max(0, Math.floor((now - status.receivedAt) / 1_000));
  if (ageSeconds < 10) parts.push('Updated now');
  else if (ageSeconds < 60) parts.push(`Updated ${ageSeconds}s ago`);
  else parts.push('Status delayed');
  return parts.join(' · ');
}
