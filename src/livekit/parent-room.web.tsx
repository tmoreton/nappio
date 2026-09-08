import { StyleSheet, Text, View } from 'react-native';

import { palette, spacing } from '@/constants/design';
import type { MonitorSession, MonitorStatus } from '@/types/monitor';

type ParentRoomProps = {
  session: MonitorSession;
  audioOnly: boolean;
  onStatusChange: (status: MonitorStatus) => void;
  onBabyConnectedChange: (connected: boolean) => void;
  onError: (message: string) => void;
};

export function ParentRoom(_props: ParentRoomProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>♪</Text>
      <Text style={styles.title}>Open Nappio’s development build on a phone</Text>
      <Text style={styles.copy}>The web preview verifies the product flow; native WebRTC monitoring runs in the iOS and Android builds.</Text>
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
  icon: { color: palette.peach, fontSize: 42 },
  title: { color: palette.white, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  copy: { color: palette.sage, lineHeight: 20, maxWidth: 420, textAlign: 'center' },
});
