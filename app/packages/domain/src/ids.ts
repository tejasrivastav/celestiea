import { DomainError } from './errors';

export function parseProductId(raw: string): number {
  const productId = Number(raw);
  if (!Number.isSafeInteger(productId) || productId < 1) {
    throw new DomainError('validation_failed', `"${raw}" is not a valid product id.`, [
      { path: 'id', message: 'Must be a positive integer' },
    ]);
  }
  return productId;
}
