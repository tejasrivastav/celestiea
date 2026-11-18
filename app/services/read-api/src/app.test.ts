import { Redis } from 'iovalkey';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createPool } from '@celestiea/db';
import { createBrand, createCategory, createProduct, resetCatalog } from '../../../test/builders';
import { buildApp } from './app';

const pool = createPool({ connectionString: inject('databaseUrl') });
const valkey = new Redis(process.env.VALKEY_URL ?? 'redis://localhost:6379');
let app: FastifyInstance;
let cachedApp: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({ pool, valkey: null, logLevel: 'silent' });
  cachedApp = await buildApp({ pool, valkey, logLevel: 'silent' });
});
afterAll(async () => {
  await app.close();
  await cachedApp.close();
  await pool.end();
  valkey.disconnect();
});
beforeEach(async () => {
  await resetCatalog(pool);
  await valkey.flushdb();
});

function graphql(target: FastifyInstance, query: string, variables: object = {}, headers = {}) {
  return target.inject({
    method: 'GET',
    url: '/v1/graphql',
    query: { query, variables: JSON.stringify(variables) },
    headers,
  });
}

const productQuery = `query ($id: ID!) { product(id: $id) { name version articles { sku } } }`;

async function seedProduct(status: 'active' | 'draft' = 'active') {
  const brandId = await createBrand(pool);
  const categoryId = await createCategory(pool, 'women');
  return createProduct(pool, { brandId, categoryId, status });
}

describe('read API', () => {
  it('serves listings with a 30 second shared cache lifetime', async () => {
    await seedProduct();

    const response = await graphql(
      app,
      `
        {
          articles(first: 2) {
            nodes {
              sku
              brand {
                name
              }
            }
          }
        }
      `,
    );

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=30, stale-while-revalidate=30');
    expect(response.json().data.articles.nodes).toHaveLength(1);
  });

  it('uses the shortest lifetime when a query mixes root fields', async () => {
    const response = await graphql(
      app,
      `
        {
          brands {
            slug
          }
          articles {
            nodes {
              sku
            }
          }
        }
      `,
    );

    expect(response.headers['cache-control']).toContain('max-age=30');
  });

  it('answers 304 when the ETag still matches', async () => {
    const { productId } = await seedProduct();
    const first = await graphql(app, productQuery, { id: productId });

    const second = await graphql(
      app,
      productQuery,
      { id: productId },
      {
        'if-none-match': first.headers.etag,
      },
    );

    expect(second.statusCode).toBe(304);
  });

  it('reports domain validation errors as problem details', async () => {
    const response = await graphql(
      app,
      `
        {
          articles(after: "garbage") {
            nodes {
              sku
            }
          }
        }
      `,
    );

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().errors[0].extensions.problem).toEqual({
      type: '/problems/validation-failed',
      title: 'Validation failed',
      status: 400,
      detail: 'The cursor is invalid for this query.',
      errors: [{ path: 'after', message: 'Invalid cursor' }],
    });
  });

  it('reports malformed queries as problem details', async () => {
    const response = await graphql(
      app,
      `
        {
          articles {
            nope
          }
        }
      `,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].extensions.problem).toMatchObject({
      type: '/problems/invalid-query',
      status: 400,
    });
  });

  it('hides draft products', async () => {
    const { productId } = await seedProduct('draft');

    const response = await graphql(app, productQuery, { id: productId });

    expect(response.json().data.product).toBeNull();
  });

  it('resolves an article SKU to its product', async () => {
    const { articleSkus } = await seedProduct();

    const response = await graphql(
      app,
      `
        query ($sku: String!) {
          productByArticleSku(sku: $sku) {
            articles {
              sku
            }
          }
        }
      `,
      { sku: articleSkus[0] },
    );

    expect(response.json().data.productByArticleSku.articles).toEqual([{ sku: articleSkus[0] }]);
  });

  it('serves product detail from Valkey once cached', async () => {
    const { productId } = await seedProduct();
    await graphql(cachedApp, productQuery, { id: productId });
    await pool.query(`UPDATE products SET name = 'Changed behind the cache' WHERE id = $1`, [
      productId,
    ]);

    const cached = await graphql(cachedApp, productQuery, { id: productId });
    const uncached = await graphql(app, productQuery, { id: productId });

    expect(cached.json().data.product.name).not.toBe('Changed behind the cache');
    expect(uncached.json().data.product.name).toBe('Changed behind the cache');
  });

  it('reports readiness only when the database answers', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
  });
});
