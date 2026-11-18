import { createHash } from 'node:crypto';
import type pg from 'pg';
import { DomainError, type ProductView } from '@celestiea/domain';
import {
  evictProduct,
  findProductView,
  findStoredResponse,
  storeResponse,
  withTransaction,
  writeThroughProduct,
} from '@celestiea/db';
import { productResponse, type WriteContext, type WriteRequest, type WriteResponse } from './http';

export type WriteOutcome =
  { status: 200 | 201; view: ProductView } | { status: 204; deletedProductId: number };

interface CommittedWrite {
  outcome: WriteOutcome;
  replayed: boolean;
}

// Runs one write in a transaction. For POSTs with an Idempotency-Key, a repeat of the same
// request within 24 hours returns the stored response instead of writing again.
export async function runWrite(
  request: WriteRequest,
  context: WriteContext,
  work: (client: pg.PoolClient) => Promise<WriteOutcome>,
  location?: (view: ProductView) => string,
): Promise<WriteResponse> {
  const idempotencyKey = request.method === 'POST' ? request.headers['idempotency-key'] : undefined;
  const requestHash = createHash('sha256')
    .update(`${request.method} ${request.path}\n${request.body ?? ''}`)
    .digest('hex');

  const committed = await withTransaction(context.pool, async (client): Promise<CommittedWrite> => {
    if (idempotencyKey !== undefined) {
      const stored = await findStoredResponse(client, idempotencyKey);
      if (stored !== null) {
        if (stored.requestHash !== requestHash) {
          throw new DomainError(
            'conflict',
            'This Idempotency-Key was used for a different request.',
          );
        }
        const status = stored.status as 200 | 201;
        return { outcome: { status, view: stored.body as ProductView }, replayed: true };
      }
    }
    const outcome = await work(client);
    if (idempotencyKey !== undefined && outcome.status !== 204) {
      await storeResponse(client, idempotencyKey, {
        requestHash,
        status: outcome.status,
        body: outcome.view,
      });
    }
    return { outcome, replayed: false };
  });

  const { outcome } = committed;
  // A replayed response may be older than the cached view, so it must not overwrite it.
  if (!committed.replayed) {
    await refreshCache(context, outcome);
  }
  if (outcome.status === 204) {
    return { status: 204, headers: {} };
  }
  const headers: Record<string, string> = location ? { location: location(outcome.view) } : {};
  return productResponse(outcome.status, outcome.view, headers);
}

export async function viewAfterWrite(
  client: pg.ClientBase,
  productId: number,
): Promise<ProductView> {
  const view = await findProductView(client, productId);
  if (view === null) {
    throw new Error(`Product ${productId} vanished inside its own write transaction`);
  }
  return view;
}

// After commit only. A failed cache update is logged, not surfaced: the write succeeded
// and the entry expires on its own.
async function refreshCache(context: WriteContext, outcome: WriteOutcome): Promise<void> {
  if (context.valkey === null) {
    return;
  }
  try {
    if (outcome.status === 204) {
      await evictProduct(context.valkey, outcome.deletedProductId);
    } else {
      await writeThroughProduct(context.valkey, outcome.view);
    }
  } catch (error) {
    context.log.warn({ err: error }, 'product cache update failed');
  }
}
