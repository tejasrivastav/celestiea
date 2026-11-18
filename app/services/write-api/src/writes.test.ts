import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { createPool, createValkeyClient, listArticles } from '@celestiea/db';
import { parseArticleListQuery } from '@celestiea/domain';
import { createBrand, createCategory, createSizeChart, resetCatalog } from '../../../test/builders';
import { buildApp } from '../../read-api/src/app';
import { buildLocalServer } from './local-server';

const authToken = 'test-token';
const pool = createPool({ connectionString: inject('databaseUrl') });
const valkey = createValkeyClient(process.env.VALKEY_URL ?? 'redis://localhost:6379');
let writeApi: FastifyInstance;
let writeApiWithoutCache: FastifyInstance;
let readApi: FastifyInstance;
let readApiWithoutCache: FastifyInstance;

beforeAll(async () => {
  writeApi = buildLocalServer({ pool, valkey }, { authToken, logLevel: 'silent' });
  writeApiWithoutCache = buildLocalServer(
    { pool, valkey: null },
    { authToken, logLevel: 'silent' },
  );
  readApi = await buildApp({ pool, valkey, logLevel: 'silent' });
  readApiWithoutCache = await buildApp({ pool, valkey: null, logLevel: 'silent' });
});
afterAll(async () => {
  await Promise.all(
    [writeApi, writeApiWithoutCache, readApi, readApiWithoutCache].map((app) => app.close()),
  );
  await pool.end();
  valkey.disconnect();
});

let sizeChartId: number;
beforeEach(async () => {
  await resetCatalog(pool);
  await valkey.flushdb();
  await createBrand(pool, 'nordvik-studio');
  await createBrand(pool, 'calder-denim');
  const women = await createCategory(pool, 'women', { isLeaf: false });
  await createCategory(pool, 'women.dresses', { parentId: women });
  await createCategory(pool, 'women.tops', { parentId: women });
  sizeChartId = await createSizeChart(pool, ['XS', 'S', 'M', 'L', 'XL']);
});

function productInput(overrides: Record<string, unknown> = {}) {
  return {
    modelSku: 'NS1234567',
    brandSlug: 'nordvik-studio',
    categorySlug: 'women-dresses',
    sizeChartId,
    targetGroup: 'women',
    name: 'Satin midi dress',
    status: 'active',
    attributes: { fit: 'regular', materialComposition: [{ material: 'viscose', pct: 100 }] },
    articles: [
      {
        articleSku: 'NS1234567-K11',
        colorName: 'black',
        colorFamily: 'black',
        priceCents: 5995,
        sizes: [
          { label: 'M', gtin: '4000000000017' },
          { label: 'S', gtin: '4000000000024' },
        ],
        images: [
          {
            kind: 'packshot',
            url: '/images/placeholder/black-packshot.svg',
            width: 800,
            height: 1100,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function send(
  method: 'POST' | 'PATCH' | 'DELETE' | 'GET',
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
  app = writeApi,
) {
  return app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
      ...headers,
    },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createProduct(overrides: Record<string, unknown> = {}) {
  const response = await send('POST', '/v1/products', productInput(overrides));
  expect(response.statusCode).toBe(201);
  return response.json<{ id: number; version: number }>();
}

describe('write API', () => {
  it('creates a product with its colours and sizes in one request', async () => {
    const response = await send('POST', '/v1/products', productInput());

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/v1/products/${response.json().id}`);
    expect(response.headers.etag).toBe('"1"');
    expect(response.json().articles[0].sizes.map((size: { label: string }) => size.label)).toEqual([
      'S',
      'M',
    ]);
    expect(response.json().attributes.materialComposition).toEqual([
      { material: 'viscose', pct: 100 },
    ]);
  });

  it('rejects sizes that are not in the size chart', async () => {
    const input = productInput();
    input.articles[0]!.sizes.push({ label: 'EU 42', gtin: '4000000000031' });

    const response = await send('POST', '/v1/products', input);

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.json().errors).toEqual([
      {
        path: 'articles.0.sizes.2.label',
        message: '"EU 42" is not in the size chart (XS, S, M, L, XL)',
      },
    ]);
  });

  it('rejects schema violations with field paths', async () => {
    const response = await send('POST', '/v1/products', productInput({ name: '' }));

    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].path).toBe('name');
  });

  it('rejects a duplicate model SKU, article SKU or GTIN with 409', async () => {
    await createProduct();
    const input = productInput({ modelSku: 'NS7654321' });
    input.articles[0]!.articleSku = 'NS7654321-K11';

    const duplicateModel = await send('POST', '/v1/products', productInput());
    const duplicateGtin = await send('POST', '/v1/products', input);

    expect(duplicateModel.statusCode).toBe(409);
    expect(duplicateGtin.statusCode).toBe(409);
    expect(duplicateGtin.json().detail).toBe('A size with this GTIN already exists.');
  });

  it('replays the stored response for a repeated Idempotency-Key', async () => {
    const headers = { 'idempotency-key': 'create-dress-1' };
    const first = await send('POST', '/v1/products', productInput(), headers);
    const replay = await send('POST', '/v1/products', productInput(), headers);
    const reused = await send('POST', '/v1/products', productInput({ name: 'Other' }), headers);

    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(reused.statusCode).toBe(409);
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM products');
    expect(rows[0].count).toBe(1);
  });

  it('requires If-Match on product updates and rejects a stale version with 412', async () => {
    const product = await createProduct();

    const withoutVersion = await send('PATCH', `/v1/products/${product.id}`, { name: 'New' });
    const stale = await send(
      'PATCH',
      `/v1/products/${product.id}`,
      { name: 'New' },
      { 'if-match': '"7"' },
    );
    const current = await send(
      'PATCH',
      `/v1/products/${product.id}`,
      { name: 'New' },
      { 'if-match': '"1"' },
    );

    expect(withoutVersion.statusCode).toBe(400);
    expect(stale.statusCode).toBe(412);
    expect(current.statusCode).toBe(200);
    expect(current.headers.etag).toBe('"2"');
  });

  it("copies category, brand and status changes onto the product's articles", async () => {
    const product = await createProduct();

    await send(
      'PATCH',
      `/v1/products/${product.id}`,
      { categorySlug: 'women-tops', brandSlug: 'calder-denim', status: 'archived' },
      { 'if-match': '"1"' },
    );

    const { rows } = await pool.query(
      `SELECT c.slug AS category, b.slug AS brand, a.product_status AS status
         FROM articles a
         JOIN categories c ON c.id = a.category_id
         JOIN brands b ON b.id = a.brand_id
        WHERE a.product_id = $1`,
      [product.id],
    );
    expect(rows).toEqual([{ category: 'women-tops', brand: 'calder-denim', status: 'archived' }]);
  });

  it('hides all articles of a deleted product from listings', async () => {
    const product = await createProduct();

    const response = await send('DELETE', `/v1/products/${product.id}`);

    expect(response.statusCode).toBe(204);
    expect((await listArticles(pool, parseArticleListQuery({}))).nodes).toHaveLength(0);
  });

  it('recomputes in-stock when the last available size sells out', async () => {
    await createProduct();

    await send('PATCH', '/v1/articles/NS1234567-K11/sizes/M', { availability: 'out_of_stock' });
    const response = await send('PATCH', '/v1/articles/NS1234567-K11/sizes/S', {
      availability: 'out_of_stock',
    });

    expect(response.json().articles[0].inStock).toBe(false);
    expect(response.headers.etag).toBe('"3"');
  });

  it('updates sale prices and rejects an original price below the current one', async () => {
    await createProduct();

    const sale = await send('PATCH', '/v1/articles/NS1234567-K11', {
      priceCents: 3995,
      originalPriceCents: 5995,
    });
    const invalid = await send('PATCH', '/v1/articles/NS1234567-K11', { originalPriceCents: 100 });

    expect(sale.json().articles[0].price).toEqual({
      currentCents: 3995,
      originalCents: 5995,
      discountPct: 33,
      currency: 'EUR',
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('finds drafts by SKU for the admin', async () => {
    await createProduct({ status: 'draft' });

    const response = await send('GET', '/v1/admin/products?sku=NS1234567-K11');

    expect(response.json().status).toBe('draft');
  });

  it('answers 401 without a token and 403 with a wrong one, like API Gateway', async () => {
    const missing = await writeApi.inject({ method: 'POST', url: '/v1/products' });
    const wrong = await send('POST', '/v1/products', productInput(), {
      authorization: 'Bearer nope',
    });

    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(403);
  });

  it('reports validation errors in the same problem shape as the read API', async () => {
    const write = await send('POST', '/v1/products', productInput({ name: '' }));
    const read = await readApi.inject({
      method: 'GET',
      url: '/v1/graphql',
      query: { query: '{ articles(after: "garbage") { nodes { sku } } }' },
    });
    const writeProblem = write.json();
    const readProblem = read.json().errors[0].extensions.problem;

    expect(Object.keys(writeProblem).sort()).toEqual(Object.keys(readProblem).sort());
    expect(writeProblem).toMatchObject({
      type: readProblem.type,
      title: readProblem.title,
      status: 400,
    });
    expect(Object.keys(writeProblem.errors[0]).sort()).toEqual(
      Object.keys(readProblem.errors[0]).sort(),
    );
  });

  it('evicts a deleted product from Valkey so reads stop serving it', async () => {
    const product = await createProduct();
    const query = `query ($id: ID!) { product(id: $id) { name } }`;
    const readProduct = () =>
      readApi.inject({
        method: 'GET',
        url: '/v1/graphql',
        query: { query, variables: JSON.stringify({ id: product.id }) },
      });
    await readProduct();

    await send('DELETE', `/v1/products/${product.id}`);

    expect((await readProduct()).json().data.product).toBeNull();
  });

  describe.each([
    ['with Valkey', () => ({ write: writeApi, read: readApi })],
    ['without Valkey', () => ({ write: writeApiWithoutCache, read: readApiWithoutCache })],
  ])('reads after a write %s', (_label, apps) => {
    it('return the new data and a new ETag', async () => {
      const { write, read } = apps();
      const product = await createProduct();
      const query = `query ($id: ID!) { product(id: $id) { name } }`;
      const readProduct = () =>
        read.inject({
          method: 'GET',
          url: '/v1/graphql',
          query: { query, variables: JSON.stringify({ id: product.id }) },
        });
      const before = await readProduct();

      await send(
        'PATCH',
        `/v1/products/${product.id}`,
        { name: 'Renamed dress' },
        { 'if-match': '"1"' },
        write,
      );
      const after = await readProduct();

      expect(after.json().data.product.name).toBe('Renamed dress');
      expect(after.headers.etag).not.toBe(before.headers.etag);
    });
  });
});
