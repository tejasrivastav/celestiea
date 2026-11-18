import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';
import { DomainError } from './errors';

describe('cursor', () => {
  it('round-trips a cursor for the same sort', () => {
    const cursor = { sort: 'price_asc' as const, key: '1999', id: 42 };

    expect(decodeCursor(encodeCursor(cursor), 'price_asc')).toEqual(cursor);
  });

  it('rejects a cursor issued for a different sort', () => {
    const encoded = encodeCursor({ sort: 'price_asc', key: '1999', id: 42 });

    expect(() => decodeCursor(encoded, 'popular')).toThrow(DomainError);
  });

  it('rejects input that is not a cursor', () => {
    expect(() => decodeCursor('not-a-cursor', 'popular')).toThrow(DomainError);
    expect(() => decodeCursor(Buffer.from('{"id":"1"}').toString('base64url'), 'popular')).toThrow(
      DomainError,
    );
  });
});
