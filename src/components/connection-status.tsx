import { StyleSheet, Text, View } from 'react-native';

import { palette, radii, spacing } from '@/constants/design';
import type { MonitorStatus } from '@/types/monitor';

const presentation: Record<MonitorStatus, { color: string; background: string; label: string }> = {
  idle: { color: palette.muted, background: palette.paper, label: 'Idle' },
  'requesting-permissions': {
    color: palette.yellow,
    background: palette.yellowWash,
    label: 'Requesting access',
  },
  connecting: { color: palette.yellow, background: palette.yellowWash, label: 'Connecting' },
  connected: { color: palette.sageDark, background: palette.sageWash, label: 'Connected' },
  reconnecting: {
    color: palette.yellow,
    background: palette.yellowWash,
    label: 'Reconnecting',
  },
  disconnected: { color: palette.red, background: palette.redWash, label: 'Disconnected' },
  failed: { color: palette.red, background: palette.redWash, label: 'Connection failed' },
};

export function ConnectionStatus({ status, label }: { status: MonitorStatus; label?: string }) {
  const current = presentation[status];
  return (
    <View
      accessibilityLabel={label ?? current.label}
      style={[styles.pill, { backgroundColor: current.background }]}>
      <View style={[styles.dot, { backgroundColor: current.color }]} />
      <Text style={[styles.label, { color: current.color }]}>{label ?? current.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dot: { borderRadius: 5, height: 9, width: 9 },
  label: { fontSize: 13, fontWeight: '800' },
});
