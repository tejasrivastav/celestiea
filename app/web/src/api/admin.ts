import type { ColorFamily, SizeAvailability } from './catalog';
import { ProblemError, type Problem } from './problem';

export type PublicationStatus = 'draft' | 'active' | 'archived';

export interface AdminProduct {
  id: number;
  modelSku: string;
  name: string;
  status: PublicationStatus;
  version: number;
  brand: { slug: string; name: string };
  category: { slug: string; name: string };
  articles: {
    sku: string;
    colorName: string;
    colorFamily: ColorFamily;
    status: PublicationStatus;
    price: { currentCents: number; originalCents: number | null };
    sizes: { label: string; availability: SizeAvailability; gtin: string }[];
  }[];
}

export interface ProductCreateBody {
  modelSku: string;
  brandSlug: string;
  categorySlug: string;
  sizeChartId: number;
  targetGroup: string;
  name: string;
  description: string;
  status: PublicationStatus;
  articles: {
    articleSku: string;
    colorName: string;
    colorFamily: ColorFamily;
    priceCents: number;
    originalPriceCents: number | null;
    sizes: { label: string; gtin: string }[];
  }[];
}

// Write endpoints. The token is passed in per call; the admin page keeps it in memory.
async function send(
  token: string,
  method: string,
  path: string,
  { body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<AdminProduct | null> {
  const response = await fetch(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) {
    return null;
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProblemError({
      type: '/problems/unauthorized',
      title: 'Not authorized',
      status: response.status,
      detail: 'The admin token was rejected.',
    });
  }
  const json = (await response.json()) as unknown;
  if (!response.ok) {
    throw new ProblemError(json as Problem);
  }
  return json as AdminProduct;
}

const ifMatch = (version: number) => ({ 'if-match': `"${version}"` });
const productPath = (id: number) => `/v1/products/${id}`;
const articlePath = (sku: string) => `/v1/articles/${encodeURIComponent(sku)}`;

export const adminApi = {
  findBySku: (token: string, sku: string) =>
    send(token, 'GET', `/v1/admin/products?sku=${encodeURIComponent(sku)}`),
  create: (token: string, body: ProductCreateBody, idempotencyKey: string) =>
    send(token, 'POST', '/v1/products', { body, headers: { 'idempotency-key': idempotencyKey } }),
  updateProduct: (
    token: string,
    product: AdminProduct,
    patch: { name?: string; status?: PublicationStatus },
  ) =>
    send(token, 'PATCH', productPath(product.id), {
      body: patch,
      headers: ifMatch(product.version),
    }),
  deleteProduct: (token: string, product: AdminProduct) =>
    send(token, 'DELETE', productPath(product.id), { headers: ifMatch(product.version) }),
  updateArticle: (
    token: string,
    product: AdminProduct,
    sku: string,
    patch: { priceCents?: number; originalPriceCents?: number | null; status?: PublicationStatus },
  ) => send(token, 'PATCH', articlePath(sku), { body: patch, headers: ifMatch(product.version) }),
  deleteArticle: (token: string, product: AdminProduct, sku: string) =>
    send(token, 'DELETE', articlePath(sku), { headers: ifMatch(product.version) }),
  setSizeAvailability: (
    token: string,
    product: AdminProduct,
    sku: string,
    label: string,
    availability: SizeAvailability,
  ) =>
    send(token, 'PATCH', `${articlePath(sku)}/sizes/${encodeURIComponent(label)}`, {
      body: { availability },
      headers: ifMatch(product.version),
    }),
};
