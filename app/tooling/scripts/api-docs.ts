// Writes the API contracts into docs/: openapi.yaml for the REST write API (from the
// shared TypeBox schemas) and schema.graphql for the read API. Run: pnpm docs:api
import { writeFile } from 'node:fs/promises';
import { stringify } from 'yaml';
import {
  ArticleCreateInput,
  ArticlePatchInput,
  ProductCreateInput,
  ProductPatchInput,
  SizeAvailabilityInput,
} from '@celestiea/domain';
import { schema } from '../../services/read-api/src/schema';

const docs = new URL('../../../docs/', import.meta.url);

const problem = {
  content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
};
const product = {
  headers: {
    ETag: {
      description: 'Product version, e.g. "4". Send it back as If-Match.',
      schema: { type: 'string' },
    },
  },
  content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductView' } } },
};
const ifMatch = (required: boolean) => ({
  name: 'If-Match',
  in: 'header',
  required,
  description: 'Product version the change is based on; 412 if it is no longer current.',
  schema: { type: 'string', example: '"3"' },
});
const idempotencyKey = {
  name: 'Idempotency-Key',
  in: 'header',
  description: 'Replays return the stored response for 24 hours.',
  schema: { type: 'string' },
};
const productId = { name: 'id', in: 'path', required: true, schema: { type: 'integer' } };
const sku = { name: 'sku', in: 'path', required: true, schema: { type: 'string' } };
const body = (name: string) => ({
  required: true,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } },
});
const errors = {
  '400': { description: 'Validation failed', ...problem },
  '401': { description: 'No bearer token' },
  '403': { description: 'Wrong bearer token' },
  '404': { description: 'Not found', ...problem },
};

const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'celestiea write API',
    version: '1.0.0',
    description:
      'Catalog writes, served by one Lambda behind an API Gateway authorizer. Reads are GraphQL (docs/schema.graphql). Errors are RFC 9457 problem details.',
  },
  servers: [{ url: 'http://localhost:8080', description: 'Local gateway' }],
  security: [{ bearer: [] }],
  paths: {
    '/v1/products': {
      post: {
        summary: 'Create a product with its colours, sizes and images',
        parameters: [idempotencyKey],
        requestBody: body('ProductCreateInput'),
        responses: {
          '201': { description: 'Created', ...product },
          ...errors,
          '409': { description: 'Duplicate model SKU, article SKU or GTIN', ...problem },
        },
      },
    },
    '/v1/products/{id}': {
      patch: {
        summary: 'Update product fields; propagates brand, category and status to its articles',
        parameters: [productId, ifMatch(true)],
        requestBody: body('ProductPatchInput'),
        responses: {
          '200': { description: 'Updated', ...product },
          ...errors,
          '412': { description: 'Version mismatch', ...problem },
        },
      },
      delete: {
        summary: 'Soft-delete the product and all its articles',
        parameters: [productId, ifMatch(false)],
        responses: {
          '204': { description: 'Deleted' },
          ...errors,
          '412': { description: 'Version mismatch', ...problem },
        },
      },
    },
    '/v1/products/{id}/articles': {
      post: {
        summary: 'Add a colour article',
        parameters: [productId, ifMatch(false), idempotencyKey],
        requestBody: body('ArticleCreateInput'),
        responses: {
          '201': { description: 'Created', ...product },
          ...errors,
          '409': { description: 'Duplicate SKU or GTIN', ...problem },
        },
      },
    },
    '/v1/articles/{sku}': {
      patch: {
        summary: 'Update price, sale price, colour name or status',
        parameters: [sku, ifMatch(false)],
        requestBody: body('ArticlePatchInput'),
        responses: { '200': { description: 'Updated', ...product }, ...errors },
      },
      delete: {
        summary: 'Soft-delete one colour article',
        parameters: [sku, ifMatch(false)],
        responses: { '200': { description: 'Remaining product', ...product }, ...errors },
      },
    },
    '/v1/articles/{sku}/sizes/{sizeLabel}': {
      patch: {
        summary: 'Set size availability; recomputes the article in-stock flag',
        parameters: [
          sku,
          {
            name: 'sizeLabel',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: '32%2F34',
          },
          ifMatch(false),
        ],
        requestBody: body('SizeAvailabilityInput'),
        responses: { '200': { description: 'Updated', ...product }, ...errors },
      },
    },
    '/v1/admin/products': {
      get: {
        summary: 'Find a product by model or article SKU, including drafts',
        parameters: [{ name: 'sku', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Found', ...product }, ...errors },
      },
    },
  },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    schemas: {
      ProductCreateInput,
      ProductPatchInput,
      ArticleCreateInput,
      ArticlePatchInput,
      SizeAvailabilityInput,
      ProductView: {
        type: 'object',
        description:
          'The product aggregate with all non-deleted articles, sizes (in size-chart order) and images; same shape as the GraphQL Product plus status fields.',
      },
      Problem: {
        type: 'object',
        required: ['type', 'title', 'status', 'detail'],
        properties: {
          type: { type: 'string', example: '/problems/validation-failed' },
          title: { type: 'string' },
          status: { type: 'integer' },
          detail: { type: 'string' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

// JSON.parse(JSON.stringify()) drops TypeBox's internal symbols before serializing.
await writeFile(
  new URL('openapi.yaml', docs),
  `# Generated by pnpm docs:api; do not edit.\n${stringify(JSON.parse(JSON.stringify(openapi)))}`,
);
await writeFile(
  new URL('schema.graphql', docs),
  `# Generated by pnpm docs:api; do not edit.\n${schema.trim()}\n`,
);
