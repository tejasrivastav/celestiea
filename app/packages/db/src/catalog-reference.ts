import type pg from 'pg';
import type { SizeSystem } from '@celestiea/domain';
import { prepared } from './prepared';

export interface CategoryRow {
  slug: string;
  name: string;
  path: string;
  depth: number;
  isLeaf: boolean;
  parentSlug: string | null;
}

export interface BrandRow {
  slug: string;
  name: string;
  isPremium: boolean;
}

export interface SizeChartRow {
  id: number;
  name: string;
  system: SizeSystem;
  sizes: string[];
}

export async function listSizeCharts(pool: pg.Pool): Promise<SizeChartRow[]> {
  const { rows } = await pool.query<SizeChartRow>(
    `SELECT id, name, system, sizes FROM size_charts ORDER BY id`,
  );
  return rows;
}

export async function listCategories(pool: pg.Pool): Promise<CategoryRow[]> {
  const { rows } = await pool.query<CategoryRow>(
    `SELECT c.slug,
            c.name,
            c.path::text AS path,
            c.depth,
            c.is_leaf AS "isLeaf",
            parent.slug AS "parentSlug"
       FROM categories c
       LEFT JOIN categories parent ON parent.id = c.parent_id
      ORDER BY c.path`,
  );
  return rows;
}

export async function listBrands(pool: pg.Pool): Promise<BrandRow[]> {
  const { rows } = await pool.query<BrandRow>(
    `SELECT slug, name, is_premium AS "isPremium" FROM brands ORDER BY name`,
  );
  return rows;
}

// Products hang off leaf categories only, so a parent category is expanded to its leaves.
export async function findCategoryLeafIds(pool: pg.Pool, slug: string): Promise<number[]> {
  const { rows } = await pool.query<{ id: number }>(
    prepared(
      `SELECT leaf.id
       FROM categories parent
       JOIN categories leaf ON leaf.path <@ parent.path
      WHERE parent.slug = $1
        AND leaf.is_leaf`,
      [slug],
    ),
  );
  return rows.map((row) => row.id);
}
