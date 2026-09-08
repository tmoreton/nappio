import { Platform } from 'react-native';

export const palette = {
  canvas: '#F6F3EC',
  paper: '#FFFDF8',
  ink: '#23312F',
  muted: '#69716E',
  line: '#DFDDD5',
  sage: '#A9C1B1',
  sageDark: '#42695B',
  sageWash: '#E6EEE8',
  peach: '#E7A585',
  peachWash: '#F6E5D9',
  red: '#A74444',
  redWash: '#F6E2DF',
  yellow: '#A46B20',
  yellowWash: '#F7EAD2',
  white: '#FFFFFF',
  black: '#0B0D0D',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radii = { sm: 12, md: 18, lg: 28, pill: 999 } as const;
export const type = {
  serif: Platform.select({ ios: 'New York', default: 'serif' }),
  mono: Platform.select({ ios: 'SF Mono', default: 'monospace' }),
} as const;
