import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { parseArticleListQuery, type ArticleListInput, type ArticleSort } from '@celestiea/domain';
import { createBrand, createCategory, createProduct, resetCatalog } from '../../../test/builders';
import { countArticles, listArticles } from './article-listing';
import { createPool } from './pool';

const pool = createPool({ connectionString: inject('databaseUrl') });
afterAll(() => pool.end());
beforeEach(() => resetCatalog(pool));

async function list(input: ArticleListInput) {
  return listArticles(pool, parseArticleListQuery(input));
}

async function walkAllPages(sort: ArticleSort, pageSize: number): Promise<string[]> {
  const skus: string[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await list({ sort, first: pageSize, after });
    skus.push(...page.nodes.map((tile) => tile.sku));
    if (!page.hasNextPage) {
      return skus;
    }
    after = page.endCursor;
  }
}

describe('listArticles', () => {
  it('returns each article exactly once, in order, when sort values tie', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    const created: { sku: string; priceCents: number; popularity: number }[] = [];
    for (let index = 0; index < 23; index += 1) {
      const priceCents = [1999, 2999, 3999][index % 3]!;
      const popularity = index % 2;
      const { articleSkus } = await createProduct(pool, {
        brandId,
        categoryId,
        articles: [{ priceCents, popularity }],
      });
      created.push({ sku: articleSkus[0]!, priceCents, popularity });
    }
    const byPriceThenInsertion = [...created].sort((a, b) => a.priceCents - b.priceCents);
    const byPopularityDesc = [...created].reverse().sort((a, b) => b.popularity - a.popularity);

    expect(await walkAllPages('price_asc', 4)).toEqual(byPriceThenInsertion.map((a) => a.sku));
    expect(await walkAllPages('price_desc', 4)).toEqual(
      [...byPriceThenInsertion].reverse().map((a) => a.sku),
    );
    expect(await walkAllPages('popular', 5)).toEqual(byPopularityDesc.map((a) => a.sku));
  });

  it('keeps microsecond timestamps intact across pages of the newest sort', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    for (const releasedAt of [
      '2026-05-01T10:00:00.000001Z',
      '2026-05-01T10:00:00.000002Z',
      '2026-05-01T10:00:00.000003Z',
    ]) {
      await createProduct(pool, { brandId, categoryId, articles: [{ releasedAt }] });
    }

    expect(await walkAllPages('newest', 1)).toHaveLength(3);
  });

  it('includes descendant categories when filtering by a parent category', async () => {
    const brandId = await createBrand(pool);
    const women = await createCategory(pool, 'women', { isLeaf: false });
    const dresses = await createCategory(pool, 'women.dresses', { isLeaf: false, parentId: women });
    const maxi = await createCategory(pool, 'women.dresses.maxi', { parentId: dresses });
    const tops = await createCategory(pool, 'women.tops', { parentId: women });
    const men = await createCategory(pool, 'men');
    const { articleSkus: maxiSkus } = await createProduct(pool, { brandId, categoryId: maxi });
    const { articleSkus: topSkus } = await createProduct(pool, { brandId, categoryId: tops });
    await createProduct(pool, { brandId, categoryId: men });

    const womenPage = await list({ filter: { category: 'women' } });
    const dressesPage = await list({ filter: { category: 'women-dresses' } });

    expect(womenPage.nodes.map((tile) => tile.sku).sort()).toEqual(
      [...maxiSkus, ...topSkus].sort(),
    );
    expect(dressesPage.nodes.map((tile) => tile.sku)).toEqual(maxiSkus);
  });

  it('treats price bounds as inclusive', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    for (const priceCents of [999, 1000, 2000, 2001]) {
      await createProduct(pool, { brandId, categoryId, articles: [{ priceCents }] });
    }

    const page = await list({
      filter: { minPriceCents: 1000, maxPriceCents: 2000 },
      sort: 'price_asc',
    });

    expect(page.nodes.map((tile) => tile.price.currentCents)).toEqual([1000, 2000]);
  });

  it('combines brand, colour, size and sale filters', async () => {
    const wanted = await createBrand(pool, 'wanted');
    const other = await createBrand(pool, 'other');
    const categoryId = await createCategory(pool, 'women');
    const match = {
      colorFamily: 'navy' as const,
      originalPriceCents: 5999,
      sizes: [['M', 'low_stock']] as [string, 'low_stock'][],
    };
    const { articleSkus } = await createProduct(pool, {
      brandId: wanted,
      categoryId,
      articles: [match],
    });
    await createProduct(pool, { brandId: other, categoryId, articles: [match] });
    await createProduct(pool, {
      brandId: wanted,
      categoryId,
      articles: [{ ...match, colorFamily: 'red' }],
    });
    await createProduct(pool, {
      brandId: wanted,
      categoryId,
      articles: [{ ...match, originalPriceCents: null }],
    });
    await createProduct(pool, {
      brandId: wanted,
      categoryId,
      articles: [
        {
          ...match,
          sizes: [
            ['M', 'out_of_stock'],
            ['L', 'in_stock'],
          ],
        },
      ],
    });

    const page = await list({
      filter: { brands: ['wanted'], colors: ['navy'], sizes: ['M'], onSale: true },
    });

    expect(page.nodes.map((tile) => tile.sku)).toEqual(articleSkus);
  });

  it('hides sold-out articles unless inStock is false', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    await createProduct(pool, {
      brandId,
      categoryId,
      articles: [{ sizes: [['M', 'out_of_stock']] }],
    });

    expect((await list({})).nodes).toHaveLength(0);
    expect((await list({ filter: { inStock: false } })).nodes).toHaveLength(1);
  });

  it('hides drafts, archived colours and deleted products', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    await createProduct(pool, { brandId, categoryId, status: 'draft' });
    await createProduct(pool, { brandId, categoryId, articles: [{ status: 'archived' }] });
    const { productId } = await createProduct(pool, { brandId, categoryId });
    await pool.query('UPDATE articles SET deleted_at = now() WHERE product_id = $1', [productId]);

    expect((await list({})).nodes).toHaveLength(0);
  });

  it('sorts by discount over sale items only', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    for (const originalPriceCents of [2000, 4000, null]) {
      await createProduct(pool, {
        brandId,
        categoryId,
        articles: [{ priceCents: 1000, originalPriceCents }],
      });
    }

    const page = await list({ sort: 'discount' });

    expect(page.nodes.map((tile) => tile.price.discountPct)).toEqual([75, 50]);
  });
});

describe('countArticles', () => {
  it('caps the count instead of counting every match', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    for (let index = 0; index < 4; index += 1) {
      await createProduct(pool, { brandId, categoryId });
    }
    const query = parseArticleListQuery({});

    expect(await countArticles(pool, query, 10)).toEqual({ value: 4, isCapped: false });
    expect(await countArticles(pool, query, 3)).toEqual({ value: 3, isCapped: true });
  });
});
