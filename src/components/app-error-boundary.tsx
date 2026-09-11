import { router } from 'expo-router';
import { Component, type ErrorInfo, type PropsWithChildren } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { palette, radii, spacing, type } from '@/constants/design';

type AppErrorBoundaryState = { hasError: boolean };

export class AppErrorBoundary extends Component<PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('NapNear encountered an unrecoverable screen error.', error, info.componentStack);
  }

  private restart = () => {
    this.setState({ hasError: false });
    router.replace('/');
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.eyebrow}>NAPNEAR NEEDS A FRESH START</Text>
          <Text style={styles.title}>Something unexpected happened.</Text>
          <Text style={styles.copy}>
            Return home and reconnect. If monitoring was active, the saved session may still be available.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={this.restart}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Return home</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  safe: { backgroundColor: palette.canvas, flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  eyebrow: { color: palette.sageDark, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  title: {
    color: palette.ink,
    fontFamily: type.serif,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 43,
    marginTop: spacing.sm,
  },
  copy: { color: palette.muted, fontSize: 16, lineHeight: 24, marginTop: spacing.md },
  button: {
    alignItems: 'center',
    backgroundColor: palette.ink,
    borderRadius: radii.pill,
    marginTop: spacing.xl,
    paddingVertical: 16,
  },
  buttonText: { color: palette.white, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
