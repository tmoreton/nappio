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
      title: 'NapNear monitoring stopped',
      body: reason,
      sound: 'default',
      interruptionLevel: 'timeSensitive',
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
      body: 'NapNear heard sustained sound from the Baby Unit. Open NapNear to listen.',
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      data: { kind: 'sound-detected' },
    },
    trigger: null,
  });
}

export async function notifyMonitoringTest(): Promise<void> {
  const permission = await getMonitoringAlertPermission();
  if (permission !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'NapNear alerts are working',
      body: 'You will hear an alert for sustained sound, a lost connection, or low Baby Unit power.',
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      data: { kind: 'monitoring-test' },
    },
    trigger: null,
  });
}

export async function notifyBabyBatteryLow(percentage: number): Promise<void> {
  const permission = await getMonitoringAlertPermission();
  if (permission !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Baby Unit battery is low',
      body: `The Baby Unit has ${Math.max(0, Math.min(100, Math.round(percentage)))}% battery remaining. Connect it to power.`,
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      data: { kind: 'baby-battery-low' },
    },
    trigger: null,
  });
}

export async function notifyBabyPowerDisconnected(): Promise<void> {
  const permission = await getMonitoringAlertPermission();
  if (permission !== 'granted') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Baby Unit unplugged',
      body: 'The Baby Unit stopped charging. Check its power connection.',
      sound: 'default',
      interruptionLevel: 'timeSensitive',
      data: { kind: 'baby-power-disconnected' },
    },
    trigger: null,
  });
}
