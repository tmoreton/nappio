import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { MonitoringAlertPermission } from '@/monitoring/notifications';

const CHANNEL_ID = 'monitoring-alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function permissionFromStatus(status: Notifications.PermissionStatus): MonitoringAlertPermission {
  if (status === Notifications.PermissionStatus.GRANTED) return 'granted';
  if (status === Notifications.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}

async function prepareAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Monitoring alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
  });
}

export async function getMonitoringAlertPermission(): Promise<MonitoringAlertPermission> {
  await prepareAndroidChannel();
  const permissions = await Notifications.getPermissionsAsync();
  return permissionFromStatus(permissions.status);
}

export async function requestMonitoringAlerts(): Promise<MonitoringAlertPermission> {
  await prepareAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  const permissions = current.granted ? current : await Notifications.requestPermissionsAsync();
  return permissionFromStatus(permissions.status);
}

export async function notifyMonitoringInterrupted(reason: string): Promise<void> {
  const permission = await getMonitoringAlertPermission();
  if (permission !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nappio monitoring stopped',
      body: reason,
      sound: 'default',
    },
    trigger: null,
  });
}
