export type MonitoringAlertPermission = 'granted' | 'denied' | 'undetermined';

export async function getMonitoringAlertPermission(): Promise<MonitoringAlertPermission> {
  return 'denied';
}

export async function requestMonitoringAlerts(): Promise<MonitoringAlertPermission> {
  return 'denied';
}

export async function notifyMonitoringInterrupted(_reason: string): Promise<void> {}

export async function notifySoundDetected(): Promise<void> {}

export async function notifyMonitoringTest(): Promise<void> {}

export async function notifyBabyBatteryLow(_percentage: number): Promise<void> {}

export async function notifyBabyPowerDisconnected(): Promise<void> {}
