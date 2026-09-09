import { StyleSheet, View } from 'react-native';

import { palette } from '@/constants/design';

type BrandMarkProps = {
  backgroundColor?: string;
  size?: number;
};

export function BrandMark({ backgroundColor = palette.canvas, size = 36 }: BrandMarkProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        { borderRadius: size * 0.32, height: size, width: size },
      ]}>
      <View
        style={[
          styles.moon,
          {
            backgroundColor,
            height: size * 0.62,
            left: size * 0.25,
            top: size * 0.11,
            width: size * 0.62,
          },
        ]}
      />
      <View
        style={[
          styles.moonCutout,
          {
            height: size * 0.58,
            left: size * 0.44,
            top: size * 0.04,
            width: size * 0.58,
          },
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            borderRadius: size * 0.08,
            height: size * 0.16,
            left: size * 0.19,
            top: size * 0.68,
            width: size * 0.16,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    backgroundColor: palette.ink,
    overflow: 'hidden',
  },
  moon: {
    borderRadius: 999,
    position: 'absolute',
  },
  moonCutout: {
    backgroundColor: palette.ink,
    borderRadius: 999,
    position: 'absolute',
  },
  dot: {
    backgroundColor: palette.peach,
    position: 'absolute',
  },
});
