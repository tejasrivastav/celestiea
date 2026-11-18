import type { ProductKindKey } from './product-kinds';
import type { SizeChartKey } from './size-charts';

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
      ['knitted-dresses', 'Knitted dresses', 'knit', 'alpha', 'knitted dress'],
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
