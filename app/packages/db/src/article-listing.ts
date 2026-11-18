import type pg from 'pg';
import {
  encodeCursor,
  type ArticleFilter,
  type ArticleListQuery,
  type ArticleSort,
  type ArticleTile,
  type ImageKind,
} from '@celestiea/domain';
import { findCategoryLeafIds } from './catalog-reference';

export interface ArticlePage {
  nodes: ArticleTile[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface CappedCount {
  value: number;
  isCapped: boolean;
}

const sortColumns: Record<ArticleSort, { column: string; direction: 'ASC' | 'DESC' }> = {
  popular: { column: 'a.popularity_score', direction: 'DESC' },
  price_asc: { column: 'a.price_cents', direction: 'ASC' },
  price_desc: { column: 'a.price_cents', direction: 'DESC' },
  newest: { column: 'a.released_at', direction: 'DESC' },
  discount: { column: 'a.discount_pct', direction: 'DESC' },
};

// Must stay textually identical to the predicate of the partial listing indexes.
const listedPredicate = `a.deleted_at IS NULL AND a.status = 'active' AND a.product_status = 'active'`;

class SqlParams {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

async function buildConditions(
  pool: pg.Pool,
  filter: ArticleFilter,
  sort: ArticleSort,
  params: SqlParams,
): Promise<string[] | null> {
  const conditions = [listedPredicate];

  if (filter.category !== undefined) {
    const leafIds = await findCategoryLeafIds(pool, filter.category);
    if (leafIds.length === 0) {
      return null;
    }
    // A single id stays an equality so the (category_id, sort, id) indexes return rows
    // already in order; ANY(...) over several leaves cannot.
    conditions.push(
      leafIds.length === 1
        ? `a.category_id = ${params.add(leafIds[0])}`
        : `a.category_id = ANY(${params.add(leafIds)})`,
    );
  }
  if (filter.brands !== undefined) {
    conditions.push(
      `a.brand_id IN (SELECT id FROM brands WHERE slug = ANY(${params.add(filter.brands)}))`,
    );
  }
  if (filter.colors !== undefined) {
    conditions.push(`a.color_family = ANY(${params.add(filter.colors)}::color_family[])`);
  }
  if (filter.sizes !== undefined) {
    conditions.push(`EXISTS (
          SELECT 1
            FROM article_sizes s
           WHERE s.article_id = a.id
             AND s.size_label = ANY(${params.add(filter.sizes)})
             AND s.availability <> 'out_of_stock'
        )`);
  }
  if (filter.minPriceCents !== undefined) {
    conditions.push(`a.price_cents >= ${params.add(filter.minPriceCents)}`);
  }
  if (filter.maxPriceCents !== undefined) {
    conditions.push(`a.price_cents <= ${params.add(filter.maxPriceCents)}`);
  }
  if (filter.targetGroup !== undefined) {
    conditions.push(`a.target_group = ${params.add(filter.targetGroup)}`);
  }
  // The discount sort only makes sense for sale items and its index is partial on them.
  if (filter.onSale === true || sort === 'discount') {
    conditions.push('a.is_on_sale');
  }
  if (filter.inStock) {
    conditions.push('a.in_stock');
  }
  return conditions;
}

interface TileRow extends Omit<ArticleTile, 'brand' | 'price' | 'image'> {
  sortKey: string;
  brandSlug: string;
  brandName: string;
  brandIsPremium: boolean;
  priceCents: number;
  originalPriceCents: number | null;
  discountPct: number;
  currency: string;
  imageKind: ImageKind | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
}

export async function listArticles(pool: pg.Pool, query: ArticleListQuery): Promise<ArticlePage> {
  const params = new SqlParams();
  const conditions = await buildConditions(pool, query.filter, query.sort, params);
  if (conditions === null) {
    return { nodes: [], hasNextPage: false, endCursor: null };
  }

  const { column, direction } = sortColumns[query.sort];
  if (query.after !== null) {
    const comparator = direction === 'ASC' ? '>' : '<';
    conditions.push(
      `(${column}, a.id) ${comparator} (${params.add(query.after.key)}, ${params.add(query.after.id)})`,
    );
  }
  const orderBy = `${column} ${direction}, a.id ${direction}`;

  // The inner query picks one page using only the articles table, so the planner can
  // walk a listing index and stop after the limit. Joins run for that page only.
  const { rows } = await pool.query<TileRow>(
    `SELECT a.id,
            a.article_sku AS sku,
            a.product_id AS "productId",
            p.name AS "productName",
            b.slug AS "brandSlug",
            b.name AS "brandName",
            b.is_premium AS "brandIsPremium",
            a.color_name AS "colorName",
            a.color_family AS "colorFamily",
            a.price_cents AS "priceCents",
            a.original_price_cents AS "originalPriceCents",
            a.discount_pct AS "discountPct",
            a.currency,
            a.sort_key AS "sortKey",
            image.kind AS "imageKind",
            image.url AS "imageUrl",
            image.width AS "imageWidth",
            image.height AS "imageHeight",
            coalesce(sizes.available, '{}') AS "availableSizes"
       FROM (
         SELECT a.*, ${column}::text AS sort_key
           FROM articles a
          WHERE ${conditions.join('\n            AND ')}
          ORDER BY ${orderBy}
          LIMIT ${params.add(query.first + 1)}
       ) a
       JOIN products p ON p.id = a.product_id
       JOIN brands b ON b.id = a.brand_id
       LEFT JOIN LATERAL (
         SELECT i.kind, i.url, i.width, i.height
           FROM article_images i
          WHERE i.article_id = a.id
          ORDER BY i.position
          LIMIT 1
       ) image ON true
       LEFT JOIN LATERAL (
         SELECT array_agg(s.size_label ORDER BY s.size_sort) AS available
           FROM article_sizes s
          WHERE s.article_id = a.id
            AND s.availability <> 'out_of_stock'
       ) sizes ON true
      ORDER BY ${orderBy}`,
    params.values,
  );

  const pageRows = rows.slice(0, query.first);
  const last = pageRows.at(-1);
  return {
    nodes: pageRows.map(toTile),
    hasNextPage: rows.length > query.first,
    endCursor:
      last === undefined
        ? null
        : encodeCursor({ sort: query.sort, key: last.sortKey, id: last.id }),
  };
}

// An exact COUNT(*) over a broad filter reads most of the table, so totals are capped:
// beyond the cap the client shows "1,000+".
export async function countArticles(
  pool: pg.Pool,
  query: ArticleListQuery,
  cap = 1000,
): Promise<CappedCount> {
  const params = new SqlParams();
  const conditions = await buildConditions(pool, query.filter, query.sort, params);
  if (conditions === null) {
    return { value: 0, isCapped: false };
  }
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*) AS count
       FROM (
         SELECT 1
           FROM articles a
          WHERE ${conditions.join('\n            AND ')}
          LIMIT ${params.add(cap + 1)}
       ) capped`,
    params.values,
  );
  const count = rows[0]?.count ?? 0;
  return { value: Math.min(count, cap), isCapped: count > cap };
}

function toTile(row: TileRow): ArticleTile {
  return {
    id: row.id,
    sku: row.sku,
    productId: row.productId,
    productName: row.productName,
    brand: { slug: row.brandSlug, name: row.brandName, isPremium: row.brandIsPremium },
    colorName: row.colorName,
    colorFamily: row.colorFamily,
    price: {
      currentCents: row.priceCents,
      originalCents: row.originalPriceCents,
      discountPct: row.discountPct,
      currency: row.currency,
    },
    image:
      row.imageKind === null
        ? null
        : {
            kind: row.imageKind,
            url: row.imageUrl ?? '',
            width: row.imageWidth ?? 0,
            height: row.imageHeight ?? 0,
          },
    availableSizes: row.availableSizes,
  };
}
