import type { ColorFamily } from '@celestiea/domain';

export const colorNames: Record<ColorFamily, string[]> = {
  black: ['black', 'jet black', 'washed black'],
  white: ['white', 'off-white', 'cream'],
  grey: ['grey melange', 'charcoal', 'light grey'],
  blue: ['light blue', 'dark blue denim', 'mid blue denim', 'cobalt'],
  navy: ['navy', 'dark navy', 'ink'],
  red: ['red', 'burgundy', 'tomato'],
  pink: ['pink', 'dusty rose', 'fuchsia'],
  green: ['bottle green', 'sage', 'forest'],
  khaki: ['khaki', 'olive'],
  beige: ['beige', 'sand', 'camel'],
  brown: ['brown', 'chocolate', 'cognac'],
  yellow: ['yellow', 'mustard'],
  orange: ['orange', 'rust'],
  purple: ['lilac', 'plum'],
  multicolour: ['multicoloured', 'floral print', 'stripes'],
};

export const colorWeights: [ColorFamily, number][] = [
  ['black', 22],
  ['navy', 12],
  ['white', 12],
  ['grey', 9],
  ['blue', 8],
  ['beige', 7],
  ['brown', 5],
  ['green', 5],
  ['khaki', 4],
  ['red', 4],
  ['pink', 4],
  ['multicolour', 3],
  ['yellow', 2],
  ['orange', 2],
  ['purple', 1],
];
