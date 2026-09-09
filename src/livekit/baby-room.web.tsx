import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/design';
import type { MonitorSession, MonitorStatus } from '@/types/monitor';

type BabyRoomProps = {
  session: MonitorSession;
  onStatusChange: (status: MonitorStatus) => void;
  onParentCountChange: (count: number) => void;
  onError: (message: string) => void;
};

export function BabyRoom(_props: BabyRoomProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>◉</Text>
      <Text style={styles.title}>Use the iOS or Android development build</Text>
      <Text style={styles.copy}>LiveKit camera streaming depends on native WebRTC and is unavailable in this web preview.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  icon: { color: palette.sage, fontSize: 42 },
  title: { color: palette.white, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  copy: { color: palette.sage, lineHeight: 20, maxWidth: 360, textAlign: 'center' },
});
