import type { ArticleSort } from './catalog';
import { DomainError } from './errors';

// A keyset position: the sort column's value of the last row plus its id as tiebreaker.
// The sort is embedded so a cursor from one ordering can't be replayed against another.
export interface Cursor {
  sort: ArticleSort;
  key: number | string;
  id: number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function decodeCursor(encoded: string, sort: ArticleSort): Cursor {
  const invalid = new DomainError('validation_failed', 'The cursor is invalid for this query.', [
    { path: 'after', message: 'Invalid cursor' },
  ]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw invalid;
  }
  if (!isCursor(parsed) || parsed.sort !== sort) {
    throw invalid;
  }
  return parsed;
}

function isCursor(value: unknown): value is Cursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sort === 'string' &&
    (typeof candidate.key === 'number' || typeof candidate.key === 'string') &&
    Number.isSafeInteger(candidate.id)
  );
}
