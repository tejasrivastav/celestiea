import type pg from 'pg';
import type { Redis } from 'iovalkey';
import type { BaseLogger } from 'pino';
import { DomainError, toProblem, type ProductView } from '@celestiea/domain';

// Transport-neutral request/response, so the same handlers serve API Gateway events in
// Lambda and the Fastify adapter used locally.
export interface WriteRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  headers: Record<string, string | undefined>;
  body: string | null;
}

export interface WriteResponse {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
}

export interface WriteContext {
  pool: pg.Pool;
  valkey: Redis | null;
  log: Logger;
}

// The subset shared by pino in Lambda and Fastify's request logger locally.
type Logger = Pick<BaseLogger, 'info' | 'warn' | 'error'>;

export function productResponse(
  status: number,
  view: ProductView,
  headers: Record<string, string> = {},
): WriteResponse {
  return {
    status,
    headers: { 'content-type': 'application/json', etag: `"${view.version}"`, ...headers },
    body: view,
  };
}

export function problemResponse(error: unknown, log: Logger): WriteResponse {
  const problem = toProblem(error);
  if (problem.status >= 500) {
    log.error({ err: error }, 'write request failed');
  }
  return {
    status: problem.status,
    headers: { 'content-type': 'application/problem+json' },
    body: problem,
  };
}

export function parseJsonBody(request: WriteRequest): unknown {
  try {
    return JSON.parse(request.body ?? '');
  } catch {
    throw new DomainError('validation_failed', 'The request body must be JSON.');
  }
}

// Accepts the version as a strong or weak ETag: "3" or W/"3".
export function parseIfMatch(
  request: WriteRequest,
  { required }: { required: boolean },
): number | null {
  const header = request.headers['if-match'];
  if (header === undefined) {
    if (required) {
      throw new DomainError('validation_failed', 'If-Match with the product version is required.', [
        { path: 'If-Match', message: 'Required' },
      ]);
    }
    return null;
  }
  const match = /^(?:W\/)?"(\d+)"$/.exec(header.trim());
  if (match === null) {
    throw new DomainError('validation_failed', 'If-Match must be a version ETag such as "3".', [
      { path: 'If-Match', message: 'Invalid ETag' },
    ]);
  }
  return Number(match[1]);
}
