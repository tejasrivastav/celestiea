import type { Redis } from 'iovalkey';
import type { ProductView } from '@celestiea/domain';

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
