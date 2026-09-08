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

function permissionFromStatus(
  permissions: Notifications.NotificationPermissionsStatus,
): MonitoringAlertPermission {
  if (Platform.OS === 'ios' && permissions.ios) {
    const authorized = [
      Notifications.IosAuthorizationStatus.AUTHORIZED,
      Notifications.IosAuthorizationStatus.PROVISIONAL,
      Notifications.IosAuthorizationStatus.EPHEMERAL,
    ].includes(permissions.ios.status);
    if (authorized && permissions.ios.allowsSound !== false) return 'granted';
    if (permissions.ios.status === Notifications.IosAuthorizationStatus.DENIED || authorized) {
      return 'denied';
    }
    return 'undetermined';
  }

  if (permissions.status === Notifications.PermissionStatus.GRANTED) return 'granted';
  if (permissions.status === Notifications.PermissionStatus.DENIED) return 'denied';
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
  return permissionFromStatus(permissions);
}

export async function requestMonitoringAlerts(): Promise<MonitoringAlertPermission> {
  await prepareAndroidChannel();
  const current = await Notifications.getPermissionsAsync();
  const permissions = current.granted
    ? current
    : await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
  return permissionFromStatus(permissions);
}

export async function notifyMonitoringInterrupted(reason: string): Promise<void> {
  const permission = await getMonitoringAlertPermission();
  if (permission !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nappio monitoring stopped',
      body: reason,
      sound: 'default',
      data: { kind: 'connection-interrupted' },
    },
    trigger: null,
  });
}

export async function notifySoundDetected(): Promise<void> {
  const permission = await getMonitoringAlertPermission();
  if (permission !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Sound detected',
      body: 'Nappio heard sustained sound from the Baby Unit. Open Nappio to listen.',
      sound: 'default',
      data: { kind: 'sound-detected' },
    },
    trigger: null,
  });
}
