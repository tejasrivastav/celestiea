import pg from 'pg';
import { DomainError } from '@celestiea/domain';

const conflictMessages: Record<string, string> = {
  products_model_sku_key: 'A product with this model SKU already exists.',
  articles_article_sku_key: 'An article with this SKU already exists.',
  article_sizes_gtin_key: 'A size with this GTIN already exists.',
  article_sizes_article_id_size_label_key: 'An article lists the same size twice.',
  idempotency_keys_pkey: 'A request with this Idempotency-Key is still being processed.',
};

export async function withTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw translateConstraintViolation(error);
  } finally {
    client.release();
  }
}

// Uniqueness and price invariants are enforced by the schema; this turns their violations
// into domain errors instead of duplicating every check in application code.
function translateConstraintViolation(error: unknown): unknown {
  if (!(error instanceof pg.DatabaseError) || error.constraint === undefined) {
    return error;
  }
  if (error.code === '23505') {
    return new DomainError(
      'conflict',
      conflictMessages[error.constraint] ?? 'The resource already exists.',
    );
  }
  if (error.code === '23514') {
    return new DomainError('validation_failed', 'A value is out of range.', [
      { path: error.constraint, message: 'originalPriceCents must be greater than priceCents' },
    ]);
  }
  return error;
}
