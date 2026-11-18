import type pg from 'pg';
import { attributesFromStorage, type ProductView } from '@celestiea/domain';

interface ProductViewRow extends Omit<
  ProductView,
  'attributes' | 'brand' | 'category' | 'updatedAt'
> {
  attributes: Record<string, unknown>;
  brandSlug: string;
  brandName: string;
  brandIsPremium: boolean;
  categorySlug: string;
  categoryName: string;
  categoryPath: string;
  updatedAt: Date;
}

// The whole aggregate in one round trip. Includes drafts and archived colours so the
// write API can return it too; the read API narrows it with toPublicProductView.
export async function findProductView(
  db: pg.Pool | pg.ClientBase,
  productId: number,
): Promise<ProductView | null> {
  const { rows } = await db.query<ProductViewRow>(
    `SELECT p.id,
            p.model_sku AS "modelSku",
            p.name,
            p.description,
            p.status,
            p.version,
            p.target_group AS "targetGroup",
            p.attributes,
            p.sustainability,
            p.updated_at AS "updatedAt",
            b.slug AS "brandSlug",
            b.name AS "brandName",
            b.is_premium AS "brandIsPremium",
            c.slug AS "categorySlug",
            c.name AS "categoryName",
            c.path::text AS "categoryPath",
            chart.system AS "sizeSystem",
            coalesce((
              SELECT json_agg(json_build_object(
                       'sku', a.article_sku,
                       'colorName', a.color_name,
                       'colorFamily', a.color_family,
                       'price', json_build_object(
                         'currentCents', a.price_cents,
                         'originalCents', a.original_price_cents,
                         'discountPct', a.discount_pct,
                         'currency', a.currency
                       ),
                       'status', a.status,
                       'inStock', a.in_stock,
                       'sizes', coalesce((
                         SELECT json_agg(json_build_object(
                                  'label', s.size_label,
                                  'availability', s.availability,
                                  'gtin', s.gtin
                                ) ORDER BY s.size_sort)
                           FROM article_sizes s
                          WHERE s.article_id = a.id
                       ), '[]'),
                       'images', coalesce((
                         SELECT json_agg(json_build_object(
                                  'kind', i.kind,
                                  'url', i.url,
                                  'width', i.width,
                                  'height', i.height
                                ) ORDER BY i.position)
                           FROM article_images i
                          WHERE i.article_id = a.id
                       ), '[]')
                     ) ORDER BY a.id)
                FROM articles a
               WHERE a.product_id = p.id
                 AND a.deleted_at IS NULL
            ), '[]') AS articles
       FROM products p
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN size_charts chart ON chart.id = p.size_chart_id
      WHERE p.id = $1
        AND p.deleted_at IS NULL`,
    [productId],
  );
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  const {
    brandSlug,
    brandName,
    brandIsPremium,
    categorySlug,
    categoryName,
    categoryPath,
    ...product
  } = row;
  return {
    ...product,
    attributes: attributesFromStorage(row.attributes),
    brand: { slug: brandSlug, name: brandName, isPremium: brandIsPremium },
    category: { slug: categorySlug, name: categoryName, path: categoryPath },
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findProductIdByArticleSku(
  pool: pg.Pool,
  sku: string,
): Promise<number | null> {
  const { rows } = await pool.query<{ productId: number }>(
    `SELECT product_id AS "productId" FROM articles WHERE article_sku = $1 AND deleted_at IS NULL`,
    [sku],
  );
  return rows[0]?.productId ?? null;
}
