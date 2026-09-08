import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { palette, spacing } from '@/constants/design';

type ScreenProps = PropsWithChildren<{
  contentStyle?: StyleProp<ViewStyle>;
  edges?: readonly Edge[];
  scroll?: boolean;
}>;

const DEFAULT_EDGES: readonly Edge[] = ['top', 'bottom', 'left', 'right'];

export function Screen({ children, contentStyle, edges = DEFAULT_EDGES, scroll = false }: ScreenProps) {
  const content = <View style={[styles.content, contentStyle]}>{children}</View>;

  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: palette.canvas, flex: 1 },
  content: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 680,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  scroll: { flexGrow: 1 },
});
