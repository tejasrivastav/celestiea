import type pg from 'pg';
import type { ColorFamily, PublicationStatus, SizeAvailability } from '@celestiea/domain';

let sequence = 0;
const next = () => (sequence += 1);

export async function resetCatalog(pool: pg.Pool): Promise<void> {
  await pool.query(
    `TRUNCATE brands, categories, size_charts, products, articles, article_sizes,
              article_images, idempotency_keys
     RESTART IDENTITY CASCADE`,
  );
}

export async function createBrand(pool: pg.Pool, slug = `brand-${next()}`): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO brands (slug, name) VALUES ($1, $1) RETURNING id`,
    [slug],
  );
  return rows[0]!.id;
}

export async function createCategory(
  pool: pg.Pool,
  path: string,
  { isLeaf = true, parentId = null }: { isLeaf?: boolean; parentId?: number | null } = {},
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO categories (slug, name, parent_id, path, is_leaf)
     VALUES ($1, $1, $2, $3, $4)
     RETURNING id`,
    [path.replaceAll('.', '-'), parentId, path, isLeaf],
  );
  return rows[0]!.id;
}

export async function createSizeChart(
  pool: pg.Pool,
  sizes = ['XS', 'S', 'M', 'L', 'XL'],
): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO size_charts (name, system, sizes) VALUES ($1, 'alpha', $2) RETURNING id`,
    [`chart-${next()}`, sizes],
  );
  return rows[0]!.id;
}

export interface ArticleSpec {
  priceCents?: number;
  originalPriceCents?: number | null;
  popularity?: number;
  colorFamily?: ColorFamily;
  status?: PublicationStatus;
  releasedAt?: string;
  sizes?: [label: string, availability: SizeAvailability][];
}

export interface ProductSpec {
  brandId: number;
  categoryId: number;
  sizeChartId?: number | null;
  status?: PublicationStatus;
  articles?: ArticleSpec[];
}

// Inserts a product aggregate directly, bypassing the write API, so read tests control
// every column. Denormalized article columns are copied the same way the write path does.
export async function createProduct(
  pool: pg.Pool,
  spec: ProductSpec,
): Promise<{ productId: number; articleSkus: string[] }> {
  const status = spec.status ?? 'active';
  const modelSku = `TS${String(next()).padStart(7, '0')}`;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO products (model_sku, brand_id, category_id, target_group, name, size_chart_id, status)
     VALUES ($1, $2, $3, 'women', $4, $5, $6)
     RETURNING id`,
    [
      modelSku,
      spec.brandId,
      spec.categoryId,
      `Product ${modelSku}`,
      spec.sizeChartId ?? null,
      status,
    ],
  );
  const productId = rows[0]!.id;

  const articleSkus: string[] = [];
  for (const [index, article] of (spec.articles ?? [{}]).entries()) {
    const sku = `${modelSku}-${index + 1}`;
    const sizes = article.sizes ?? [['M', 'in_stock']];
    const { rows: articleRows } = await pool.query<{ id: number }>(
      `INSERT INTO articles (product_id, article_sku, color_name, color_family, price_cents,
                             original_price_cents, popularity_score, released_at, status, in_stock,
                             brand_id, category_id, target_group, product_status)
       VALUES ($1, $2, $3::text, $3::color_family, $4, $5, $6, coalesce($7::timestamptz, now()), $8,
               $9, $10, $11, 'women', $12)
       RETURNING id`,
      [
        productId,
        sku,
        article.colorFamily ?? 'black',
        article.priceCents ?? 4999,
        article.originalPriceCents ?? null,
        article.popularity ?? 0,
        article.releasedAt ?? null,
        article.status ?? 'active',
        sizes.some(([, availability]) => availability !== 'out_of_stock'),
        spec.brandId,
        spec.categoryId,
        status,
      ],
    );
    const articleId = articleRows[0]!.id;
    for (const [position, [label, availability]] of sizes.entries()) {
      await pool.query(
        `INSERT INTO article_sizes (article_id, size_label, size_sort, gtin, availability)
         VALUES ($1, $2, $3, $4, $5)`,
        [articleId, label, position, String(next()).padStart(13, '0'), availability],
      );
    }
    articleSkus.push(sku);
  }
  return { productId, articleSkus };
}
