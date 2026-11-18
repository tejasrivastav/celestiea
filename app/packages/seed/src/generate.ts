import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ColorFamily,
  PublicationStatus,
  SizeAvailability,
  TargetGroup,
} from '@celestiea/domain';
import { brandNames } from './catalog/brands';
import { categoryTree, type CategoryNode, type LeafDefinition } from './catalog/categories';
import { colorNames, colorWeights } from './catalog/colors';
import { productKinds, type ProductKind } from './catalog/product-kinds';
import { sizeCharts, type SizeChartKey } from './catalog/size-charts';
import { createCsvWriter } from './csv';
import { createRandom, type Random } from './random';
import { seedFileName, type SeedTableName } from './tables';

export type SeedScale = 'small' | 'full';

const productCountByScale: Record<SeedScale, number> = { small: 2_000, full: 120_000 };

const randomSeed = 20_261_118;
// Fixed so that "newest" ordering and seasons don't change between runs.
const referenceDate = Date.UTC(2026, 10, 1);
const dayMs = 86_400_000;

interface Leaf {
  id: number;
  definition: LeafDefinition;
  targetGroup: TargetGroup;
  weight: number;
}

const targetGroupByRoot: Record<string, TargetGroup> = {
  women: 'women',
  men: 'men',
  'kids.girls': 'kids_girls',
  'kids.boys': 'kids_boys',
};
const leafShareByTargetGroup: Partial<Record<TargetGroup, number>> = {
  women: 45,
  men: 38,
  kids_girls: 8.5,
  kids_boys: 8.5,
};

export async function generateSeed(
  outDir: string,
  scale: SeedScale,
): Promise<Record<SeedTableName, number>> {
  await mkdir(outDir, { recursive: true });
  const random = createRandom(randomSeed);
  const writers = {
    brands: createCsvWriter(join(outDir, seedFileName('brands'))),
    categories: createCsvWriter(join(outDir, seedFileName('categories'))),
    size_charts: createCsvWriter(join(outDir, seedFileName('size_charts'))),
    products: createCsvWriter(join(outDir, seedFileName('products'))),
    articles: createCsvWriter(join(outDir, seedFileName('articles'))),
    article_sizes: createCsvWriter(join(outDir, seedFileName('article_sizes'))),
    article_images: createCsvWriter(join(outDir, seedFileName('article_images'))),
  };
  const counts: Record<SeedTableName, number> = {
    brands: 0,
    categories: 0,
    size_charts: 0,
    products: 0,
    articles: 0,
    article_sizes: 0,
    article_images: 0,
  };
  const write = async (
    table: SeedTableName,
    row: Parameters<(typeof writers)['brands']['write']>[0],
  ) => {
    counts[table] += 1;
    await writers[table].write(row);
  };

  const brands = brandNames.map((brand, index) => ({ id: index + 1, ...brand }));
  for (const brand of brands) {
    await write('brands', [brand.id, slugify(brand.name), brand.name, brand.isPremium]);
  }

  const chartIds = new Map<SizeChartKey, number>();
  for (const [key, chart] of Object.entries(sizeCharts)) {
    const id = chartIds.size + 1;
    chartIds.set(key as SizeChartKey, id);
    await write('size_charts', [id, chart.name, chart.system, chart.sizes]);
  }

  const leaves: Leaf[] = [];
  let categoryId = 0;
  const visit = async (node: CategoryNode, parent: { id: number; path: string[] } | null) => {
    categoryId += 1;
    const id = categoryId;
    const path = [...(parent?.path ?? []), node.slug];
    const isLeaf = node.leaves === undefined && node.children === undefined;
    await write('categories', [
      id,
      path.join('-'),
      node.name,
      parent?.id ?? null,
      toLtree(path),
      isLeaf,
    ]);
    for (const child of node.children ?? []) {
      await visit(child, { id, path });
    }
    for (const definition of node.leaves ?? []) {
      const [slug, name] = definition;
      categoryId += 1;
      const leafPath = [...path, slug];
      await write('categories', [
        categoryId,
        leafPath.join('-'),
        name,
        id,
        toLtree(leafPath),
        true,
      ]);
      leaves.push({ id: categoryId, definition, targetGroup: targetGroupFor(leafPath), weight: 0 });
    }
  };
  for (const root of categoryTree) {
    await visit(root, null);
  }
  for (const leaf of leaves) {
    const siblings = leaves.filter((other) => other.targetGroup === leaf.targetGroup).length;
    leaf.weight = (leafShareByTargetGroup[leaf.targetGroup] ?? 0) / siblings;
  }
  const leafOptions = leaves.map((leaf) => [leaf, leaf.weight] as const);

  let articleId = 0;
  let sizeId = 0;
  for (let productId = 1; productId <= productCountByScale[scale]; productId += 1) {
    const leaf = random.weighted(leafOptions);
    const [, , kindKey, chartKey, noun] = leaf.definition;
    const kind: ProductKind = productKinds[kindKey];
    const chart = sizeCharts[chartKey];
    const brand = random.pick(brands);
    const fabric = random.pick(kind.fabrics);
    const releasedAt = referenceDate - Math.floor(730 * random.next() ** 2) * dayMs;
    const attributes = buildAttributes(random, kind, fabric, noun, releasedAt);
    const name = productName(random, kind, fabric[0], noun, attributes.fit);
    const status = random.weighted<PublicationStatus>([
      ['active', 95],
      ['draft', 3],
      ['archived', 2],
    ]);
    const targetGroup =
      kind.profile === 'accessory' && random.chance(0.25) ? 'unisex' : leaf.targetGroup;
    const modelSku = `${brandCode(brand.name)}${productId.toString(36).toUpperCase().padStart(7, '0')}`;
    const createdAt = new Date(releasedAt - random.int(3, 30) * dayMs);
    const basePriceCents = basePrice(random, kind, brand.isPremium);
    const sustainability = random.chance(0.2)
      ? [random.pick(['organic_cotton', 'recycled_materials', 'responsible_wool', 'water_saving'])]
      : [];

    await write('products', [
      productId,
      modelSku,
      brand.id,
      leaf.id,
      targetGroup,
      name,
      describe(name, fabric[1], attributes.care_instructions),
      attributes,
      sustainability,
      chartIds.get(chartKey)!,
      status,
      createdAt.toISOString(),
      createdAt.toISOString(),
    ]);

    const colorCount = random.weighted([
      [1, 25],
      [2, 30],
      [3, 22],
      [4, 13],
      [5, 10],
    ]);
    const families = pickDistinctColors(random, colorCount);
    for (const [index, family] of families.entries()) {
      articleId += 1;
      const soldOut = random.chance(0.03);
      const windowStart = random.int(0, chart.sizes.length - chart.windowSize);
      const sizes = chart.sizes
        .slice(windowStart, windowStart + chart.windowSize)
        .map((label, offset) => {
          sizeId += 1;
          const availability: SizeAvailability = soldOut
            ? 'out_of_stock'
            : random.weighted([
                ['in_stock', 80],
                ['low_stock', 10],
                ['out_of_stock', 10],
              ]);
          return { id: sizeId, label, sort: windowStart + offset, availability };
        });
      const onSale = random.chance(0.25);
      const priceCents = onSale ? salePrice(random, basePriceCents) : basePriceCents;
      const popularity = Math.floor(10 * (1 - random.next()) ** -1.2 * (index === 0 ? 1 : 0.5));
      const articleReleasedAt = Math.min(referenceDate, releasedAt + random.int(0, 60) * dayMs);

      await write('articles', [
        articleId,
        productId,
        `${modelSku}-${family.charAt(0).toUpperCase()}${index + 1}1`,
        random.pick(colorNames[family]),
        family,
        priceCents,
        onSale ? basePriceCents : null,
        Math.min(popularity, 1_000_000),
        new Date(articleReleasedAt).toISOString(),
        random.chance(0.03) ? 'archived' : 'active',
        sizes.some((size) => size.availability !== 'out_of_stock'),
        brand.id,
        leaf.id,
        targetGroup,
        status,
      ]);
      for (const size of sizes) {
        await write('article_sizes', [
          size.id,
          articleId,
          size.label,
          size.sort,
          gtin(size.id),
          size.availability,
        ]);
      }

      const imageKinds = ['packshot'];
      if (random.chance(0.7)) imageKinds.push('model');
      if (random.chance(0.5)) imageKinds.push('detail');
      for (const [position, imageKind] of imageKinds.entries()) {
        await write('article_images', [
          articleId,
          position + 1,
          imageKind,
          `/images/placeholder/${family}-${imageKind}.svg`,
          800,
          1100,
        ]);
      }
    }
  }

  await Promise.all(Object.values(writers).map((writer) => writer.close()));
  return counts;
}

function buildAttributes(
  random: Random,
  kind: ProductKind,
  [, composition]: ProductKind['fabrics'][number],
  noun: string,
  releasedAt: number,
) {
  const released = new Date(releasedAt);
  const month = released.getUTCMonth() + 1;
  const year = released.getUTCFullYear() % 100;
  const season = month >= 2 && month <= 7 ? `SS${year}` : `AW${month === 1 ? year - 1 : year}`;
  const attributes: Record<string, unknown> & { fit?: string; care_instructions: string } = {
    material_composition: composition.map(([material, pct]) => ({ material, pct })),
    season,
    care_instructions: random.pick([
      'machine wash at 30°C',
      'machine wash at 40°C',
      'hand wash',
      'dry clean only',
    ]),
  };

  switch (kind.profile) {
    case 'dress':
      attributes.length =
        ['maxi', 'midi', 'mini'].find((length) => noun.startsWith(length)) ??
        random.pick(['midi', 'knee-length']);
      attributes.neckline = random.pick(['round', 'v-neck', 'square', 'high']);
      attributes.sleeve_length = random.pick(['sleeveless', 'short', 'long']);
      attributes.pattern = random.pick(['plain', 'plain', 'floral', 'striped', 'print']);
      break;
    case 'top':
    case 'knit':
      attributes.fit = random.pick(['slim', 'regular', 'regular', 'relaxed', 'oversized']);
      attributes.neckline = random.pick(['round', 'crew', 'v-neck', 'high']);
      attributes.sleeve_length = random.pick(['short', 'long', 'three-quarter']);
      attributes.pattern = random.pick(['plain', 'plain', 'striped', 'print']);
      break;
    case 'bottom':
      attributes.fit = random.pick(['slim', 'regular', 'relaxed']);
      attributes.length = random.pick(['full-length', 'cropped', 'ankle']);
      attributes.closure = random.pick(['button and zip', 'elasticated waist', 'drawstring']);
      break;
    case 'outerwear':
      attributes.fit = random.pick(['regular', 'relaxed', 'oversized']);
      attributes.length = random.pick(['short', 'hip-length', 'knee-length']);
      attributes.closure = random.pick(['zip', 'button', 'press studs']);
      break;
    case 'shoe':
      attributes.upper_material = composition[0]![0];
      attributes.sole_material = random.pick(['rubber', 'rubber', 'EVA', 'leather']);
      attributes.heel_height_cm = noun.includes('boots') ? random.int(2, 7) : random.int(1, 4);
      attributes.closure = random.pick(['laces', 'zip', 'slip-on', 'buckle']);
      break;
    case 'accessory':
      attributes.pattern = random.pick(['plain', 'plain', 'checked', 'print']);
      break;
  }
  return attributes;
}

function productName(
  random: Random,
  kind: ProductKind,
  fabric: string,
  noun: string,
  fit: string | undefined,
): string {
  if (kind.profile === 'shoe') {
    return `${random.pick(['Chunky', 'Classic', 'Minimal', 'Platform', 'Retro'])} ${fabric} ${noun}`;
  }
  if (fit !== undefined) {
    return `${capitalize(fit)} fit ${fabric} ${noun}`;
  }
  return `${capitalize(fabric)} ${noun}`;
}

function describe(name: string, composition: [string, number][], care: string): string {
  const materials = composition.map(([material, pct]) => `${pct}% ${material}`).join(' and ');
  return `${name} made from ${materials}. Care: ${care}.`;
}

// Log-normal around the geometric middle of the range, so most prices sit mid-range
// with a tail towards both ends.
function basePrice(random: Random, kind: ProductKind, isPremium: boolean): number {
  const [min, max] = kind.priceEuros;
  const median = Math.sqrt(min * max);
  const sigma = Math.log(max / min) / 4;
  const euros = Math.min(max, Math.max(min, median * Math.exp(sigma * random.normal())));
  return endInNinetyFiveOrNinetyNine(random, isPremium ? euros * 1.8 : euros);
}

function salePrice(random: Random, originalCents: number): number {
  const discountPct = random.weighted([
    [10, 15],
    [15, 12],
    [20, 18],
    [25, 10],
    [30, 15],
    [40, 12],
    [50, 10],
    [60, 5],
    [70, 3],
  ]);
  const euros = Math.floor((originalCents / 100) * (1 - discountPct / 100));
  return euros * 100 + 99 < originalCents ? euros * 100 + 99 : (euros - 1) * 100 + 99;
}

function endInNinetyFiveOrNinetyNine(random: Random, euros: number): number {
  return Math.floor(euros) * 100 + (random.chance(0.5) ? 95 : 99);
}

function pickDistinctColors(random: Random, count: number): ColorFamily[] {
  const families = new Set<ColorFamily>();
  while (families.size < count) {
    families.add(random.weighted(colorWeights));
  }
  return [...families];
}

// EAN-13 with a "40" prefix and a valid check digit; the size id makes it unique.
function gtin(sizeId: number): string {
  const body = `40${String(sizeId).padStart(10, '0')}`;
  const sum = [...body].reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0,
  );
  return `${body}${(10 - (sum % 10)) % 10}`;
}

function brandCode(name: string): string {
  const [prefix = '', suffix = ''] = name.split(' ');
  return `${prefix.charAt(0)}${suffix.charAt(0)}`.toUpperCase();
}

function targetGroupFor(path: string[]): TargetGroup {
  const root = path[0] === 'kids' ? `kids.${path[1]}` : (path[0] ?? '');
  const targetGroup = targetGroupByRoot[root];
  if (targetGroup === undefined) {
    throw new Error(`No target group for category path ${path.join('.')}`);
  }
  return targetGroup;
}

function toLtree(path: string[]): string {
  return path.map((label) => label.replaceAll('-', '_')).join('.');
}

function slugify(text: string): string {
  return text.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
