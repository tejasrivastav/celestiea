import type pg from 'pg';
import { DomainError } from '@celestiea/domain';

export interface StoredResponse {
  requestHash: string;
  status: number;
  body: unknown;
}

// Keys live in Postgres rather than Valkey so idempotency holds with the cache disabled,
// and the key is saved in the same transaction as the write it protects.
export async function findStoredResponse(
  client: pg.ClientBase,
  key: string,
): Promise<StoredResponse | null> {
  const { rows } = await client.query<StoredResponse>(
    `SELECT request_hash AS "requestHash", response_status AS status, response_body AS body
       FROM idempotency_keys
      WHERE key = $1
        AND created_at > now() - interval '24 hours'`,
    [key],
  );
  return rows[0] ?? null;
}

// An expired key is overwritten in place; there is no separate cleanup job.
export async function storeResponse(
  client: pg.ClientBase,
  key: string,
  response: StoredResponse,
): Promise<void> {
  const { rowCount } = await client.query(
    `INSERT INTO idempotency_keys (key, request_hash, response_status, response_body)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO UPDATE
        SET request_hash = excluded.request_hash,
            response_status = excluded.response_status,
            response_body = excluded.response_body,
            created_at = now()
      WHERE idempotency_keys.created_at <= now() - interval '24 hours'`,
    [key, response.requestHash, response.status, JSON.stringify(response.body)],
  );
  if (rowCount === 0) {
    throw new DomainError('conflict', 'This Idempotency-Key was already used.');
  }
}
