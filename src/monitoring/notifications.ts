export type MonitoringAlertPermission = 'granted' | 'denied' | 'undetermined';

export async function getMonitoringAlertPermission(): Promise<MonitoringAlertPermission> {
  return 'denied';
}

export async function requestMonitoringAlerts(): Promise<MonitoringAlertPermission> {
  return 'denied';
}

export async function notifyMonitoringInterrupted(_reason: string): Promise<void> {}
