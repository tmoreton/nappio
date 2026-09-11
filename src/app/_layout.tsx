import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppErrorBoundary } from '@/components/app-error-boundary';
import { palette } from '@/constants/design';
import { MonitorSessionProvider } from '@/state/monitor-session';

export default function RootLayout() {
  return (
    <AppErrorBoundary>
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
          <Stack.Screen
            name="onboarding"
            options={{ gestureEnabled: false, headerShown: false }}
          />
          <Stack.Screen name="baby" options={{ headerShown: false }} />
          <Stack.Screen name="parent/pair" options={{ title: 'Pair a camera' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
          <Stack.Screen name="support" options={{ title: 'Help & support' }} />
          <Stack.Screen
            name="parent/monitor"
            options={{ headerShown: false }}
          />
        </Stack>
      </MonitorSessionProvider>
    </AppErrorBoundary>
  );
}
