import type { ColorFamily, SizeSystem } from '@celestiea/domain';

// Invented names only. Each prefix/suffix pair is one brand: 10 x 8 = 80 brands.
const brandPrefixes = [
  'Nordvik',
  'Velamare',
  'Ostrava',
  'Calder',
  'Mirren',
  'Tovelund',
  'Basaltine',
  'Linnhaven',
  'Corvetta',
  'Haldegaard',
];
const brandSuffixes = [
  'Studio',
  'Atelier',
  'Denim',
  'Supply',
  'Works',
  'Line',
  'Field',
  'Collective',
];
const premiumSuffixes = new Set(['Atelier']);

export const brandNames = brandPrefixes.flatMap((prefix) =>
  brandSuffixes.map((suffix) => ({
    name: `${prefix} ${suffix}`,
    isPremium: premiumSuffixes.has(suffix) || prefix === 'Haldegaard',
  })),
);

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

type Composition = [material: string, pct: number][];
type Fabric = [label: string, composition: Composition];

export type AttributeProfile =
  'dress' | 'top' | 'knit' | 'bottom' | 'outerwear' | 'shoe' | 'accessory';

// A kind groups leaf categories that share size chart, price range, fabrics and attributes.
export interface ProductKind {
  profile: AttributeProfile;
  priceEuros: [min: number, max: number];
  fabrics: Fabric[];
}

const cotton: Fabric = ['cotton', [['cotton', 100]]];
const jersey: Fabric = [
  'jersey',
  [
    ['cotton', 95],
    ['elastane', 5],
  ],
];
const linen: Fabric = ['linen', [['linen', 100]]];
const stretch: Fabric = [
  'stretch',
  [
    ['cotton', 98],
    ['elastane', 2],
  ],
];
const recycled: Fabric = ['recycled', [['recycled polyester', 100]]];

export const productKinds = {
  dress: {
    profile: 'dress',
    priceEuros: [29.99, 149.99],
    fabrics: [
      jersey,
      linen,
      ['satin', [['viscose', 100]]],
      [
        'knitted',
        [
          ['cotton', 70],
          ['wool', 30],
        ],
      ],
    ],
  },
  top: {
    profile: 'top',
    priceEuros: [9.99, 49.99],
    fabrics: [
      cotton,
      jersey,
      linen,
      [
        'ribbed',
        [
          ['cotton', 92],
          ['elastane', 8],
        ],
      ],
      ['modal', [['modal', 100]]],
    ],
  },
  shirt: {
    profile: 'top',
    priceEuros: [24.99, 89.99],
    fabrics: [
      cotton,
      linen,
      ['oxford', [['cotton', 100]]],
      [
        'poplin',
        [
          ['cotton', 97],
          ['elastane', 3],
        ],
      ],
    ],
  },
  knit: {
    profile: 'knit',
    priceEuros: [29.99, 129.99],
    fabrics: [
      [
        'wool-blend',
        [
          ['wool', 50],
          ['polyamide', 50],
        ],
      ],
      [
        'cashmere-blend',
        [
          ['wool', 90],
          ['cashmere', 10],
        ],
      ],
      [
        'chunky',
        [
          ['acrylic', 60],
          ['wool', 40],
        ],
      ],
      [
        'brushed',
        [
          ['cotton', 80],
          ['polyester', 20],
        ],
      ],
    ],
  },
  trousers: {
    profile: 'bottom',
    priceEuros: [29.99, 99.99],
    fabrics: [
      stretch,
      linen,
      cotton,
      [
        'twill',
        [
          ['cotton', 97],
          ['elastane', 3],
        ],
      ],
    ],
  },
  jeans: {
    profile: 'bottom',
    priceEuros: [39.99, 129.99],
    fabrics: [
      stretch,
      ['rigid', [['cotton', 100]]],
      [
        'washed',
        [
          ['cotton', 99],
          ['elastane', 1],
        ],
      ],
    ],
  },
  outerwear: {
    profile: 'outerwear',
    priceEuros: [79.99, 399.99],
    fabrics: [
      [
        'wool',
        [
          ['wool', 80],
          ['polyamide', 20],
        ],
      ],
      ['quilted', [['polyester', 100]]],
      ['water-repellent', [['polyamide', 100]]],
      ['denim', [['cotton', 100]]],
    ],
  },
  sport: {
    profile: 'top',
    priceEuros: [19.99, 79.99],
    fabrics: [
      recycled,
      [
        'quick-dry',
        [
          ['polyester', 88],
          ['elastane', 12],
        ],
      ],
      [
        'seamless',
        [
          ['polyamide', 90],
          ['elastane', 10],
        ],
      ],
    ],
  },
  swim: {
    profile: 'bottom',
    priceEuros: [19.99, 69.99],
    fabrics: [
      recycled,
      [
        'ribbed',
        [
          ['polyamide', 82],
          ['elastane', 18],
        ],
      ],
    ],
  },
  shoe: {
    profile: 'shoe',
    priceEuros: [49.99, 179.99],
    fabrics: [
      ['leather', [['leather', 100]]],
      ['suede', [['suede', 100]]],
      ['canvas', [['cotton', 100]]],
      ['knit', [['polyester', 100]]],
    ],
  },
  accessory: {
    profile: 'accessory',
    priceEuros: [14.99, 89.99],
    fabrics: [['leather', [['leather', 100]]], cotton, ['wool', [['wool', 100]]], recycled],
  },
  bag: {
    profile: 'accessory',
    priceEuros: [29.99, 249.99],
    fabrics: [
      ['leather', [['leather', 100]]],
      ['canvas', [['cotton', 100]]],
      ['nylon', [['polyamide', 100]]],
    ],
  },
} satisfies Record<string, ProductKind>;

export type ProductKindKey = keyof typeof productKinds;

// [slug, display name, kind, size chart, singular noun used in product names]
export type LeafDefinition = [string, string, ProductKindKey, SizeChartKey, string];

export interface CategoryNode {
  slug: string;
  name: string;
  children?: CategoryNode[];
  leaves?: LeafDefinition[];
}

const group = (slug: string, name: string, leaves: LeafDefinition[]): CategoryNode => ({
  slug,
  name,
  leaves,
});

function adultTree(
  shoeChart: 'shoeWomen' | 'shoeMen',
  clothing: CategoryNode[],
  accessories: LeafDefinition[],
) {
  return [
    { slug: 'clothing', name: 'Clothing', children: clothing },
    {
      slug: 'shoes',
      name: 'Shoes',
      children: [
        group('trainers', 'Trainers', [
          ['low-top', 'Low-top trainers', 'shoe', shoeChart, 'low-top trainers'],
          ['high-top', 'High-top trainers', 'shoe', shoeChart, 'high-top trainers'],
          ['running-style', 'Running-style trainers', 'shoe', shoeChart, 'runner trainers'],
        ]),
        group('boots', 'Boots', [
          ['ankle-boots', 'Ankle boots', 'shoe', shoeChart, 'ankle boots'],
          ['chelsea-boots', 'Chelsea boots', 'shoe', shoeChart, 'Chelsea boots'],
          ['lace-up-boots', 'Lace-up boots', 'shoe', shoeChart, 'lace-up boots'],
        ]),
        group('loafers', 'Loafers', [['loafers', 'Loafers', 'shoe', shoeChart, 'loafers']]),
        group('sandals', 'Sandals', [
          ['flat-sandals', 'Flat sandals', 'shoe', shoeChart, 'sandals'],
          ['sliders', 'Sliders', 'shoe', shoeChart, 'sliders'],
        ]),
      ],
    },
    {
      slug: 'sports',
      name: 'Sports',
      children: [
        group('running', 'Running', [
          ['running-tops', 'Running tops', 'sport', 'alpha', 'running top'],
          ['running-tights', 'Running tights', 'sport', 'alpha', 'running tights'],
          ['running-jackets', 'Running jackets', 'sport', 'alpha', 'running jacket'],
          ['running-shoes', 'Running shoes', 'shoe', shoeChart, 'running shoes'],
        ]),
        group('training', 'Training', [
          ['training-tops', 'Training tops', 'sport', 'alpha', 'training top'],
          ['training-shorts', 'Training shorts', 'sport', 'alpha', 'training shorts'],
          ['training-shoes', 'Training shoes', 'shoe', shoeChart, 'training shoes'],
        ]),
        group('outdoor', 'Outdoor', [
          ['outdoor-jackets', 'Outdoor jackets', 'outerwear', 'alpha', 'outdoor jacket'],
          ['hiking-trousers', 'Hiking trousers', 'trousers', 'alpha', 'hiking trousers'],
          ['hiking-boots', 'Hiking boots', 'shoe', shoeChart, 'hiking boots'],
        ]),
      ],
    },
    { slug: 'accessories', name: 'Accessories', leaves: accessories },
  ] satisfies CategoryNode[];
}

const sharedAccessories: LeafDefinition[] = [
  ['backpacks', 'Backpacks', 'bag', 'oneSize', 'backpack'],
  ['hats', 'Hats and caps', 'accessory', 'oneSize', 'cap'],
  ['scarves', 'Scarves', 'accessory', 'oneSize', 'scarf'],
  ['belts', 'Belts', 'accessory', 'oneSize', 'belt'],
  ['sunglasses', 'Sunglasses', 'accessory', 'oneSize', 'sunglasses'],
];

const women = adultTree(
  'shoeWomen',
  [
    group('dresses', 'Dresses', [
      ['maxi', 'Maxi dresses', 'dress', 'alpha', 'maxi dress'],
      ['midi', 'Midi dresses', 'dress', 'alpha', 'midi dress'],
      ['mini', 'Mini dresses', 'dress', 'alpha', 'mini dress'],
      ['shirt-dresses', 'Shirt dresses', 'dress', 'alpha', 'shirt dress'],
      ['knitted-dresses', 'Knitted dresses', 'dress', 'alpha', 'knitted dress'],
    ]),
    group('tops', 'Tops', [
      ['t-shirts', 'T-shirts', 'top', 'alpha', 'T-shirt'],
      ['blouses', 'Blouses', 'shirt', 'alpha', 'blouse'],
      ['shirts', 'Shirts', 'shirt', 'alpha', 'shirt'],
      ['vest-tops', 'Vest tops', 'top', 'alpha', 'vest top'],
      ['long-sleeve-tops', 'Long-sleeve tops', 'top', 'alpha', 'long-sleeve top'],
    ]),
    group('knitwear', 'Knitwear', [
      ['jumpers', 'Jumpers', 'knit', 'alpha', 'jumper'],
      ['cardigans', 'Cardigans', 'knit', 'alpha', 'cardigan'],
      ['hoodies', 'Hoodies', 'knit', 'alpha', 'hoodie'],
      ['sweatshirts', 'Sweatshirts', 'knit', 'alpha', 'sweatshirt'],
    ]),
    group('trousers', 'Trousers', [
      ['chinos', 'Chinos', 'trousers', 'alpha', 'chinos'],
      ['wide-leg', 'Wide-leg trousers', 'trousers', 'alpha', 'wide-leg trousers'],
      ['joggers', 'Joggers', 'trousers', 'alpha', 'joggers'],
      ['leggings', 'Leggings', 'trousers', 'alpha', 'leggings'],
      ['shorts', 'Shorts', 'trousers', 'alpha', 'shorts'],
    ]),
    group('jeans', 'Jeans', [
      ['skinny', 'Skinny jeans', 'jeans', 'jeans', 'skinny jeans'],
      ['straight', 'Straight jeans', 'jeans', 'jeans', 'straight jeans'],
      ['wide-leg', 'Wide-leg jeans', 'jeans', 'jeans', 'wide-leg jeans'],
      ['mom', 'Mom jeans', 'jeans', 'jeans', 'mom jeans'],
      ['flared', 'Flared jeans', 'jeans', 'jeans', 'flared jeans'],
    ]),
    group('jackets-coats', 'Jackets and coats', [
      ['denim-jackets', 'Denim jackets', 'outerwear', 'alpha', 'denim jacket'],
      ['parkas', 'Parkas', 'outerwear', 'alpha', 'parka'],
      ['wool-coats', 'Wool coats', 'outerwear', 'alpha', 'coat'],
      ['trench-coats', 'Trench coats', 'outerwear', 'alpha', 'trench coat'],
      ['blazers', 'Blazers', 'outerwear', 'alpha', 'blazer'],
      ['puffer-jackets', 'Puffer jackets', 'outerwear', 'alpha', 'puffer jacket'],
    ]),
    group('skirts', 'Skirts', [
      ['mini-skirts', 'Mini skirts', 'trousers', 'alpha', 'mini skirt'],
      ['midi-skirts', 'Midi skirts', 'trousers', 'alpha', 'midi skirt'],
      ['maxi-skirts', 'Maxi skirts', 'trousers', 'alpha', 'maxi skirt'],
    ]),
    group('swimwear', 'Swimwear', [
      ['bikinis', 'Bikinis', 'swim', 'alpha', 'bikini'],
      ['swimsuits', 'Swimsuits', 'swim', 'alpha', 'swimsuit'],
    ]),
  ],
  [
    ['tote-bags', 'Tote bags', 'bag', 'oneSize', 'tote bag'],
    ['crossbody-bags', 'Crossbody bags', 'bag', 'oneSize', 'crossbody bag'],
    ['earrings', 'Earrings', 'accessory', 'oneSize', 'earrings'],
    ['necklaces', 'Necklaces', 'accessory', 'oneSize', 'necklace'],
    ...sharedAccessories,
  ],
);

const men = adultTree(
  'shoeMen',
  [
    group('t-shirts-polos', 'T-shirts and polos', [
      ['t-shirts', 'T-shirts', 'top', 'alpha', 'T-shirt'],
      ['polo-shirts', 'Polo shirts', 'top', 'alpha', 'polo shirt'],
      ['long-sleeve-tops', 'Long-sleeve tops', 'top', 'alpha', 'long-sleeve top'],
    ]),
    group('shirts', 'Shirts', [
      ['casual-shirts', 'Casual shirts', 'shirt', 'alpha', 'shirt'],
      ['formal-shirts', 'Formal shirts', 'shirt', 'alpha', 'formal shirt'],
      ['overshirts', 'Overshirts', 'shirt', 'alpha', 'overshirt'],
    ]),
    group('knitwear', 'Knitwear', [
      ['jumpers', 'Jumpers', 'knit', 'alpha', 'jumper'],
      ['cardigans', 'Cardigans', 'knit', 'alpha', 'cardigan'],
      ['hoodies', 'Hoodies', 'knit', 'alpha', 'hoodie'],
      ['sweatshirts', 'Sweatshirts', 'knit', 'alpha', 'sweatshirt'],
    ]),
    group('trousers', 'Trousers', [
      ['chinos', 'Chinos', 'trousers', 'alpha', 'chinos'],
      ['joggers', 'Joggers', 'trousers', 'alpha', 'joggers'],
      ['cargo-trousers', 'Cargo trousers', 'trousers', 'alpha', 'cargo trousers'],
      ['shorts', 'Shorts', 'trousers', 'alpha', 'shorts'],
      ['suit-trousers', 'Suit trousers', 'trousers', 'alpha', 'suit trousers'],
    ]),
    group('jeans', 'Jeans', [
      ['slim', 'Slim jeans', 'jeans', 'jeans', 'slim jeans'],
      ['straight', 'Straight jeans', 'jeans', 'jeans', 'straight jeans'],
      ['tapered', 'Tapered jeans', 'jeans', 'jeans', 'tapered jeans'],
      ['relaxed', 'Relaxed jeans', 'jeans', 'jeans', 'relaxed jeans'],
    ]),
    group('jackets-coats', 'Jackets and coats', [
      ['denim-jackets', 'Denim jackets', 'outerwear', 'alpha', 'denim jacket'],
      ['parkas', 'Parkas', 'outerwear', 'alpha', 'parka'],
      ['wool-coats', 'Wool coats', 'outerwear', 'alpha', 'coat'],
      ['bomber-jackets', 'Bomber jackets', 'outerwear', 'alpha', 'bomber jacket'],
      ['puffer-jackets', 'Puffer jackets', 'outerwear', 'alpha', 'puffer jacket'],
      ['blazers', 'Blazers', 'outerwear', 'alpha', 'blazer'],
    ]),
    group('swimwear', 'Swimwear', [['swim-shorts', 'Swim shorts', 'swim', 'alpha', 'swim shorts']]),
  ],
  [
    ['messenger-bags', 'Messenger bags', 'bag', 'oneSize', 'messenger bag'],
    ['wallets', 'Wallets', 'accessory', 'oneSize', 'wallet'],
    ...sharedAccessories,
  ],
);

function kidsTree(extraClothing: LeafDefinition[]): CategoryNode[] {
  return [
    group('clothing', 'Clothing', [
      ['t-shirts', 'T-shirts', 'top', 'kidsHeight', 'T-shirt'],
      ['jumpers', 'Jumpers', 'knit', 'kidsHeight', 'jumper'],
      ['hoodies', 'Hoodies', 'knit', 'kidsHeight', 'hoodie'],
      ['jeans', 'Jeans', 'jeans', 'kidsHeight', 'jeans'],
      ['trousers', 'Trousers', 'trousers', 'kidsHeight', 'trousers'],
      ['jackets', 'Jackets', 'outerwear', 'kidsHeight', 'jacket'],
      ['sportswear', 'Sportswear', 'sport', 'kidsHeight', 'sports top'],
      ...extraClothing,
    ]),
    group('shoes', 'Shoes', [
      ['trainers', 'Trainers', 'shoe', 'shoeKids', 'trainers'],
      ['boots', 'Boots', 'shoe', 'shoeKids', 'boots'],
      ['sandals', 'Sandals', 'shoe', 'shoeKids', 'sandals'],
    ]),
    group('accessories', 'Accessories', [
      ['backpacks', 'Backpacks', 'bag', 'oneSize', 'backpack'],
      ['hats', 'Hats', 'accessory', 'oneSize', 'hat'],
    ]),
  ];
}

export const categoryTree: CategoryNode[] = [
  { slug: 'women', name: 'Women', children: women },
  { slug: 'men', name: 'Men', children: men },
  {
    slug: 'kids',
    name: 'Kids',
    children: [
      {
        slug: 'girls',
        name: 'Girls',
        children: kidsTree([
          ['dresses', 'Dresses', 'dress', 'kidsHeight', 'dress'],
          ['leggings', 'Leggings', 'trousers', 'kidsHeight', 'leggings'],
          ['skirts', 'Skirts', 'trousers', 'kidsHeight', 'skirt'],
        ]),
      },
      {
        slug: 'boys',
        name: 'Boys',
        children: kidsTree([
          ['shorts', 'Shorts', 'trousers', 'kidsHeight', 'shorts'],
          ['shirts', 'Shirts', 'shirt', 'kidsHeight', 'shirt'],
        ]),
      },
    ],
  },
];

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
