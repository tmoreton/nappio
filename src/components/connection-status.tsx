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

export function ConnectionStatus({
  status,
  label,
  compact = false,
}: {
  status: MonitorStatus;
  label?: string;
  compact?: boolean;
}) {
  const current = presentation[status];
  return (
    <View
      accessibilityLabel={label ?? current.label}
      accessibilityRole="text"
      style={[styles.pill, compact && styles.compactPill, { backgroundColor: current.background }]}>
      <View style={[styles.dot, compact && styles.compactDot, { backgroundColor: current.color }]} />
      <Text
        numberOfLines={1}
        style={[styles.label, compact && styles.compactLabel, { color: current.color }]}>
        {label ?? current.label}
      </Text>
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
  compactPill: { gap: 7, maxWidth: 164, paddingHorizontal: 11, paddingVertical: 7 },
  compactDot: { height: 8, width: 8 },
  compactLabel: { flexShrink: 1, fontSize: 12 },
});
