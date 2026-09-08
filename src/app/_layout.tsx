import '@/livekit/setup';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { palette } from '@/constants/design';
import { MonitorSessionProvider } from '@/state/monitor-session';

export default function RootLayout() {
  return (
    <MonitorSessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerBackButtonDisplayMode: 'minimal',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: palette.canvas },
          headerTintColor: palette.ink,
          contentStyle: { backgroundColor: palette.canvas },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="baby" options={{ title: 'Baby camera', headerTransparent: true }} />
        <Stack.Screen name="parent/pair" options={{ title: 'Pair a camera' }} />
        <Stack.Screen
          name="parent/monitor"
          options={{ title: 'Baby monitor', headerTransparent: true }}
        />
      </Stack>
    </MonitorSessionProvider>
  );
}
