// k6 load test for the catalog. Runs against the local gateway or the CloudFront URL:
//   k6 run -e BASE_URL=http://localhost:8080 -e TOKEN=local-dev-token bench/catalog.k6.js
// Each scenario records its own latency trend so the summary shows p50/p95 per workload.
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';
const token = __ENV.TOKEN;

const trends = {
  listing: new Trend('listing_filtered', true),
  deepPages: new Trend('listing_deep_pages', true),
  productCold: new Trend('product_detail_cold', true),
  productWarm: new Trend('product_detail_warm', true),
  write: new Trend('write_price_update', true),
};

const categories = [
  'women',
  'men',
  'women-clothing-dresses',
  'men-clothing-jeans-slim',
  'women-shoes-trainers-low-top',
  'kids-girls-clothing',
  'men-sports-running-running-shoes',
];
const sorts = ['popular', 'price_asc', 'newest', 'discount'];
const tileFields =
  'sku productName brand { name } price { currentCents originalCents } image { url } availableSizes';

const scenario = (exec, startTime, vus = 10, duration = '20s') => ({
  executor: 'constant-vus',
  exec,
  vus,
  duration,
  startTime,
});

export const options = {
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)', 'count'],
  scenarios: {
    listing: scenario('listing', '0s'),
    deepPages: scenario('deepPages', '25s', 5),
    productCold: scenario('productCold', '50s'),
    productWarm: scenario('productWarm', '75s'),
    ...(token ? { write: scenario('write', '100s', 2) } : {}),
  },
};

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function graphql(query, variables, trend) {
  const params = `query=${encodeURIComponent(query)}&variables=${encodeURIComponent(JSON.stringify(variables))}`;
  const response = http.get(`${baseUrl}/v1/graphql?${params}`);
  trend.add(response.timings.duration);
  check(response, { 'status 200': (r) => r.status === 200 && !r.json('errors') });
  return response;
}

const listQuery = `query ($filter: ArticleFilter, $sort: ArticleSort, $after: String) {
  articles(filter: $filter, sort: $sort, first: 24, after: $after) {
    nodes { ${tileFields} } pageInfo { endCursor hasNextPage }
  }
}`;

export function setup() {
  const response = http.get(
    `${baseUrl}/v1/graphql?query=${encodeURIComponent(`{ articles(first: 96) { nodes { sku productId } } }`)}`,
  );
  const nodes = response.json('data.articles.nodes');
  return {
    skus: nodes.map((node) => node.sku),
    hotProductIds: nodes.slice(0, 20).map((node) => node.productId),
  };
}

export function listing() {
  const filter = { category: pick(categories) };
  if (Math.random() < 0.3) filter.onSale = true;
  if (Math.random() < 0.3) Object.assign(filter, { minPriceCents: 2000, maxPriceCents: 8000 });
  graphql(listQuery, { filter, sort: pick(sorts) }, trends.listing);
}

// Follows nextCursor for 20 pages, the way infinite scroll does.
export function deepPages() {
  let after = null;
  for (let page = 0; page < 20; page += 1) {
    const response = graphql(
      listQuery,
      { filter: { category: 'women' }, sort: 'popular', after },
      trends.deepPages,
    );
    after = response.json('data.articles.pageInfo.endCursor');
  }
}

const productQuery = `query ($id: ID!) { product(id: $id) { name articles { sku price { currentCents } sizes { label availability } } } }`;

// Random ids across the catalog: almost every request misses Valkey.
export function productCold() {
  graphql(productQuery, { id: String(1 + Math.floor(Math.random() * 120000)) }, trends.productCold);
}

export function productWarm(data) {
  graphql(productQuery, { id: pick(data.hotProductIds) }, trends.productWarm);
}

export function write(data) {
  const response = http.patch(
    `${baseUrl}/v1/articles/${encodeURIComponent(pick(data.skus))}`,
    // Clearing the sale price keeps every random price valid (it must stay below the original).
    JSON.stringify({
      priceCents: 1995 + Math.floor(Math.random() * 50) * 100,
      originalPriceCents: null,
    }),
    { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } },
  );
  trends.write.add(response.timings.duration);
  check(response, { 'write 200': (r) => r.status === 200 });
}
