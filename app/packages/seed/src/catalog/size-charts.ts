import type { SizeSystem } from '@celestiea/domain';

export interface SizeChartDefinition {
  name: string;
  system: SizeSystem;
  sizes: string[];
  // Sizes an article offers: a contiguous window of the chart.
  windowSize: number;
}

const shoeSizes = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => `EU ${from + index}`);

export const sizeCharts = {
  alpha: {
    name: 'Alpha',
    system: 'alpha',
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    windowSize: 6,
  },
  shoeWomen: { name: 'EU shoe women', system: 'eu_shoe', sizes: shoeSizes(36, 42), windowSize: 7 },
  shoeMen: { name: 'EU shoe men', system: 'eu_shoe', sizes: shoeSizes(40, 46), windowSize: 7 },
  shoeKids: { name: 'EU shoe kids', system: 'eu_shoe', sizes: shoeSizes(26, 35), windowSize: 7 },
  jeans: {
    name: 'Jeans W/L',
    system: 'jeans',
    sizes: [
      '28/30',
      '28/32',
      '29/32',
      '30/30',
      '30/32',
      '30/34',
      '31/32',
      '32/30',
      '32/32',
      '32/34',
      '33/32',
      '34/32',
      '34/34',
      '36/32',
      '36/34',
    ],
    windowSize: 8,
  },
  kidsHeight: {
    name: 'Kids height',
    system: 'kids_height',
    sizes: ['104', '110', '116', '122', '128', '134', '140', '146', '152', '158', '164'],
    windowSize: 7,
  },
  oneSize: { name: 'One size', system: 'one_size', sizes: ['One size'], windowSize: 1 },
} satisfies Record<string, SizeChartDefinition>;

export type SizeChartKey = keyof typeof sizeCharts;
