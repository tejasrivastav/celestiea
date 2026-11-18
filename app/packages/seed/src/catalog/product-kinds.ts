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
