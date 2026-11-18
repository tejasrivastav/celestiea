import type pg from 'pg';
import {
  attributesToStorage,
  DomainError,
  type ArticleCreateInput,
  type ArticlePatchInput,
  type FieldError,
  type ProductCreateInput,
  type ProductPatchInput,
  type PublicationStatus,
  type SizeAvailability,
  type TargetGroup,
} from '@celestiea/domain';
import { SqlParams } from './sql-params';

export interface LockedProduct {
  id: number;
  version: number;
  brandId: number;
  categoryId: number;
  targetGroup: TargetGroup;
  status: PublicationStatus;
  sizeChartId: number | null;
}

// Every write locks the product row first, so writes to one aggregate are serialized and
// the version check cannot race.
export async function lockProduct(
  client: pg.ClientBase,
  productId: number,
): Promise<LockedProduct> {
  const { rows } = await client.query<LockedProduct>(
    `SELECT id,
            version,
            brand_id AS "brandId",
            category_id AS "categoryId",
            target_group AS "targetGroup",
            status,
            size_chart_id AS "sizeChartId"
       FROM products
      WHERE id = $1
        AND deleted_at IS NULL
        FOR UPDATE`,
    [productId],
  );
  const product = rows[0];
  if (product === undefined) {
    throw new DomainError('not_found', `Product ${productId} does not exist.`);
  }
  return product;
}

export function assertVersion(product: LockedProduct, expectedVersion: number | null): void {
  if (expectedVersion !== null && product.version !== expectedVersion) {
    throw new DomainError(
      'version_mismatch',
      `Product ${product.id} is at version ${product.version}, not ${expectedVersion}.`,
    );
  }
}

export async function findArticleForWrite(
  client: pg.ClientBase,
  sku: string,
): Promise<{ articleId: number; productId: number }> {
  const { rows } = await client.query<{ articleId: number; productId: number }>(
    `SELECT id AS "articleId", product_id AS "productId"
       FROM articles
      WHERE article_sku = $1
        AND deleted_at IS NULL`,
    [sku],
  );
  const article = rows[0];
  if (article === undefined) {
    throw new DomainError('not_found', `Article ${sku} does not exist.`);
  }
  return article;
}

export async function createProductAggregate(
  client: pg.ClientBase,
  input: ProductCreateInput,
): Promise<number> {
  const brandId = await resolveBrandId(client, input.brandSlug);
  const categoryId = await resolveLeafCategoryId(client, input.categorySlug);
  const chartSizes = await loadSizeChart(client, input.sizeChartId);
  assertSizesInChart(input.articles, chartSizes);

  const status = input.status ?? 'draft';
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO products (model_sku, brand_id, category_id, target_group, name, description,
                           attributes, sustainability, size_chart_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      input.modelSku,
      brandId,
      categoryId,
      input.targetGroup,
      input.name,
      input.description,
      attributesToStorage(input.attributes ?? {}),
      input.sustainability,
      input.sizeChartId,
      status,
    ],
  );
  const product: LockedProduct = {
    id: rows[0]!.id,
    version: 1,
    brandId,
    categoryId,
    targetGroup: input.targetGroup,
    status,
    sizeChartId: input.sizeChartId,
  };
  for (const article of input.articles) {
    await insertArticle(client, product, chartSizes, article);
  }
  return product.id;
}

export async function addArticle(
  client: pg.ClientBase,
  product: LockedProduct,
  article: ArticleCreateInput,
): Promise<void> {
  const chartSizes =
    product.sizeChartId === null ? [] : await loadSizeChart(client, product.sizeChartId);
  assertSizesInChart([article], chartSizes);
  await insertArticle(client, product, chartSizes, article);
  await bumpVersion(client, product.id);
}

export async function updateProduct(
  client: pg.ClientBase,
  product: LockedProduct,
  patch: ProductPatchInput,
): Promise<void> {
  const params = new SqlParams();
  const assignments: string[] = [];
  if (patch.brandSlug !== undefined) {
    assignments.push(`brand_id = ${params.add(await resolveBrandId(client, patch.brandSlug))}`);
  }
  if (patch.categorySlug !== undefined) {
    const categoryId = await resolveLeafCategoryId(client, patch.categorySlug);
    assignments.push(`category_id = ${params.add(categoryId)}`);
  }
  if (patch.targetGroup !== undefined) {
    assignments.push(`target_group = ${params.add(patch.targetGroup)}`);
  }
  if (patch.name !== undefined) {
    assignments.push(`name = ${params.add(patch.name)}`);
  }
  if (patch.description !== undefined) {
    assignments.push(`description = ${params.add(patch.description)}`);
  }
  if (patch.attributes !== undefined) {
    assignments.push(`attributes = ${params.add(attributesToStorage(patch.attributes))}`);
  }
  if (patch.sustainability !== undefined) {
    assignments.push(`sustainability = ${params.add(patch.sustainability)}`);
  }
  if (patch.status !== undefined) {
    assignments.push(`status = ${params.add(patch.status)}`);
  }
  await client.query(
    `UPDATE products
        SET ${assignments.join(', ')}, version = version + 1, updated_at = now()
      WHERE id = ${params.add(product.id)}`,
    params.values,
  );
  // Listing filters read these columns from articles, so they change in the same
  // transaction as the product (docs/adr/0003-product-article-size-model.md).
  await client.query(
    `UPDATE articles a
        SET brand_id = p.brand_id,
            category_id = p.category_id,
            target_group = p.target_group,
            product_status = p.status
       FROM products p
      WHERE p.id = a.product_id
        AND a.product_id = $1`,
    [product.id],
  );
}

export async function softDeleteProduct(client: pg.ClientBase, productId: number): Promise<void> {
  await client.query(
    `UPDATE products SET deleted_at = now(), version = version + 1, updated_at = now() WHERE id = $1`,
    [productId],
  );
  await client.query(
    `UPDATE articles SET deleted_at = now() WHERE product_id = $1 AND deleted_at IS NULL`,
    [productId],
  );
}

export async function updateArticle(
  client: pg.ClientBase,
  articleId: number,
  productId: number,
  patch: ArticlePatchInput,
): Promise<void> {
  const params = new SqlParams();
  const assignments: string[] = [];
  if (patch.colorName !== undefined) {
    assignments.push(`color_name = ${params.add(patch.colorName)}`);
  }
  if (patch.priceCents !== undefined) {
    assignments.push(`price_cents = ${params.add(patch.priceCents)}`);
  }
  if (patch.originalPriceCents !== undefined) {
    assignments.push(`original_price_cents = ${params.add(patch.originalPriceCents)}`);
  }
  if (patch.status !== undefined) {
    assignments.push(`status = ${params.add(patch.status)}`);
  }
  await client.query(
    `UPDATE articles SET ${assignments.join(', ')} WHERE id = ${params.add(articleId)}`,
    params.values,
  );
  await bumpVersion(client, productId);
}

export async function softDeleteArticle(
  client: pg.ClientBase,
  articleId: number,
  productId: number,
): Promise<void> {
  await client.query(`UPDATE articles SET deleted_at = now() WHERE id = $1`, [articleId]);
  await bumpVersion(client, productId);
}

export async function setSizeAvailability(
  client: pg.ClientBase,
  articleId: number,
  productId: number,
  sizeLabel: string,
  availability: SizeAvailability,
): Promise<void> {
  const { rowCount } = await client.query(
    `UPDATE article_sizes SET availability = $3 WHERE article_id = $1 AND size_label = $2`,
    [articleId, sizeLabel, availability],
  );
  if (rowCount === 0) {
    throw new DomainError('not_found', `Size ${sizeLabel} does not exist for this article.`);
  }
  await client.query(
    `UPDATE articles a
        SET in_stock = EXISTS (
              SELECT 1
                FROM article_sizes s
               WHERE s.article_id = a.id
                 AND s.availability <> 'out_of_stock'
            )
      WHERE a.id = $1`,
    [articleId],
  );
  await bumpVersion(client, productId);
}

async function insertArticle(
  client: pg.ClientBase,
  product: LockedProduct,
  chartSizes: string[],
  article: ArticleCreateInput,
): Promise<void> {
  const inStock = article.sizes.some((size) => size.availability !== 'out_of_stock');
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO articles (product_id, article_sku, color_name, color_family, price_cents,
                           original_price_cents, status, in_stock, brand_id, category_id,
                           target_group, product_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      product.id,
      article.articleSku,
      article.colorName,
      article.colorFamily,
      article.priceCents,
      article.originalPriceCents ?? null,
      article.status ?? 'active',
      inStock,
      product.brandId,
      product.categoryId,
      product.targetGroup,
      product.status,
    ],
  );
  const articleId = rows[0]!.id;
  for (const size of article.sizes) {
    await client.query(
      `INSERT INTO article_sizes (article_id, size_label, size_sort, gtin, availability)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        articleId,
        size.label,
        chartSizes.indexOf(size.label),
        size.gtin,
        size.availability ?? 'in_stock',
      ],
    );
  }
  for (const [index, image] of article.images.entries()) {
    await client.query(
      `INSERT INTO article_images (article_id, position, kind, url, width, height)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [articleId, index + 1, image.kind, image.url, image.width, image.height],
    );
  }
}

async function bumpVersion(client: pg.ClientBase, productId: number): Promise<void> {
  await client.query(
    `UPDATE products SET version = version + 1, updated_at = now() WHERE id = $1`,
    [productId],
  );
}

async function resolveBrandId(client: pg.ClientBase, slug: string): Promise<number> {
  const { rows } = await client.query<{ id: number }>(`SELECT id FROM brands WHERE slug = $1`, [
    slug,
  ]);
  if (rows[0] === undefined) {
    throw invalidField('brandSlug', `Unknown brand "${slug}"`);
  }
  return rows[0].id;
}

async function resolveLeafCategoryId(client: pg.ClientBase, slug: string): Promise<number> {
  const { rows } = await client.query<{ id: number; isLeaf: boolean }>(
    `SELECT id, is_leaf AS "isLeaf" FROM categories WHERE slug = $1`,
    [slug],
  );
  const category = rows[0];
  if (category === undefined || !category.isLeaf) {
    throw invalidField('categorySlug', `"${slug}" is not a leaf category`);
  }
  return category.id;
}

async function loadSizeChart(client: pg.ClientBase, sizeChartId: number): Promise<string[]> {
  const { rows } = await client.query<{ sizes: string[] }>(
    `SELECT sizes FROM size_charts WHERE id = $1`,
    [sizeChartId],
  );
  if (rows[0] === undefined) {
    throw invalidField('sizeChartId', `Unknown size chart ${sizeChartId}`);
  }
  return rows[0].sizes;
}

function assertSizesInChart(articles: ArticleCreateInput[], chartSizes: string[]): void {
  const fieldErrors: FieldError[] = [];
  for (const [articleIndex, article] of articles.entries()) {
    for (const [sizeIndex, size] of article.sizes.entries()) {
      if (!chartSizes.includes(size.label)) {
        fieldErrors.push({
          path: `articles.${articleIndex}.sizes.${sizeIndex}.label`,
          message: `"${size.label}" is not in the size chart (${chartSizes.join(', ')})`,
        });
      }
    }
  }
  if (fieldErrors.length > 0) {
    throw new DomainError('validation_failed', 'Sizes do not match the size chart.', fieldErrors);
  }
}

function invalidField(path: string, message: string): DomainError {
  return new DomainError('validation_failed', message, [{ path, message }]);
}
