import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import {
  createBrand,
  createCategory,
  createProduct,
  createSizeChart,
  resetCatalog,
} from '../../../test/builders';
import { createPool } from './pool';
import { findProductView } from './product-view';

const pool = createPool({ connectionString: inject('databaseUrl') });
afterAll(() => pool.end());
beforeEach(() => resetCatalog(pool));

describe('findProductView', () => {
  it('lists sizes in size-chart order, not alphabetically', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    const sizeChartId = await createSizeChart(pool);
    const { productId } = await createProduct(pool, {
      brandId,
      categoryId,
      sizeChartId,
      articles: [
        {
          sizes: [
            ['S', 'in_stock'],
            ['M', 'in_stock'],
            ['L', 'in_stock'],
            ['XL', 'in_stock'],
          ],
        },
      ],
    });

    const view = await findProductView(pool, productId);

    expect(view?.articles[0]?.sizes.map((size) => size.label)).toEqual(['S', 'M', 'L', 'XL']);
    expect(view?.sizeSystem).toBe('alpha');
  });

  it('returns null for a deleted product', async () => {
    const brandId = await createBrand(pool);
    const categoryId = await createCategory(pool, 'women');
    const { productId } = await createProduct(pool, { brandId, categoryId });
    await pool.query('UPDATE products SET deleted_at = now() WHERE id = $1', [productId]);

    expect(await findProductView(pool, productId)).toBeNull();
  });
});
