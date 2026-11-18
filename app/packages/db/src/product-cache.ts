import { Redis } from 'iovalkey';
import type { ProductView } from '@celestiea/domain';

// Fail fast when Valkey is unavailable: a slow cache must not slow requests that
// Postgres can serve on its own.
export function createValkeyClient(url: string): Redis {
  return new Redis(url, {
    commandTimeout: 100,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

// The write API overwrites entries after each commit; the read API only fills gaps
// (SET NX). A read that raced a write and saw a lagging replica therefore cannot replace
// the writer's fresh copy. The TTL bounds the damage if a writer's SET is ever lost.
const ttlSeconds = 300;
// Bump the version when ProductView changes shape, so old entries are ignored after deploys.
const productKey = (productId: number) => `product:v1:${productId}`;

export async function getCachedProduct(
  valkey: Redis,
  productId: number,
): Promise<ProductView | null> {
  const cached = await valkey.get(productKey(productId));
  return cached === null ? null : (JSON.parse(cached) as ProductView);
}

export async function fillProductCache(valkey: Redis, view: ProductView): Promise<void> {
  await valkey.set(productKey(view.id), JSON.stringify(view), 'EX', ttlSeconds, 'NX');
}

export async function writeThroughProduct(valkey: Redis, view: ProductView): Promise<void> {
  await valkey.set(productKey(view.id), JSON.stringify(view), 'EX', ttlSeconds);
}

export async function evictProduct(valkey: Redis, productId: number): Promise<void> {
  await valkey.del(productKey(productId));
}
