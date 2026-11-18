// The seed CSVs and their load order. Generated columns (depth, discount_pct, is_on_sale)
// are left out; Postgres computes them on load.
export const seedTables = [
  { name: 'brands', columns: ['id', 'slug', 'name', 'is_premium'] },
  { name: 'categories', columns: ['id', 'slug', 'name', 'parent_id', 'path', 'is_leaf'] },
  { name: 'size_charts', columns: ['id', 'name', 'system', 'sizes'] },
  {
    name: 'products',
    columns: [
      'id',
      'model_sku',
      'brand_id',
      'category_id',
      'target_group',
      'name',
      'description',
      'attributes',
      'sustainability',
      'size_chart_id',
      'status',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'articles',
    columns: [
      'id',
      'product_id',
      'article_sku',
      'color_name',
      'color_family',
      'price_cents',
      'original_price_cents',
      'popularity_score',
      'released_at',
      'status',
      'in_stock',
      'brand_id',
      'category_id',
      'target_group',
      'product_status',
    ],
  },
  {
    name: 'article_sizes',
    columns: ['id', 'article_id', 'size_label', 'size_sort', 'gtin', 'availability'],
  },
  { name: 'article_images', columns: ['article_id', 'position', 'kind', 'url', 'width', 'height'] },
] as const;

export type SeedTableName = (typeof seedTables)[number]['name'];

export function seedFileName(table: SeedTableName): string {
  return `${table}.csv.gz`;
}
