import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radii, spacing } from '@/constants/design';

type ActionButtonProps = {
  label: string;
  detail?: string;
  icon?: 'camera' | 'monitor' | 'audio' | 'video' | 'stop';
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  compact?: boolean;
};

const icons: Record<NonNullable<ActionButtonProps['icon']>, string> = {
  camera: '●',
  monitor: '◉',
  audio: '♪',
  video: '▶',
  stop: '■',
};

export function ActionButton({
  label,
  detail,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
  compact = false,
}: ActionButtonProps) {
  const colors = {
    primary: { background: palette.ink, foreground: palette.white, border: palette.ink },
    secondary: { background: palette.paper, foreground: palette.ink, border: palette.line },
    danger: { background: palette.redWash, foreground: palette.red, border: palette.redWash },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: colors.background, borderColor: colors.border },
        (pressed || disabled) && styles.dimmed,
      ]}>
      {icon ? (
        <View
          style={[
            styles.icon,
            compact && styles.iconCompact,
            { backgroundColor: colors.foreground },
          ]}>
          <Text style={[styles.iconText, { color: colors.background }]}>{icons[icon]}</Text>
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text style={[styles.label, compact && styles.labelCompact, { color: colors.foreground }]}>
          {label}
        </Text>
        {detail ? (
          <Text style={[styles.detail, { color: colors.foreground }]}>{detail}</Text>
        ) : null}
      </View>
      <Text style={[styles.arrow, compact && styles.arrowCompact, { color: colors.foreground }]}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: 84,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  buttonCompact: { minHeight: 68, paddingVertical: 11 },
  dimmed: { opacity: 0.62 },
  icon: {
    alignItems: 'center',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  iconCompact: { borderRadius: 20, height: 40, width: 40 },
  iconText: { fontSize: 17, fontWeight: '800' },
  copy: { flex: 1, gap: 3 },
  label: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  labelCompact: { fontSize: 16 },
  detail: { fontSize: 13, lineHeight: 18, opacity: 0.72 },
  arrow: { fontSize: 30, fontWeight: '300' },
  arrowCompact: { fontSize: 26 },
});
