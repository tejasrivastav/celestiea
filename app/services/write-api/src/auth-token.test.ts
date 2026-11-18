import { describe, expect, it } from 'vitest';
import { matchesBearerToken } from './auth-token';

describe('matchesBearerToken', () => {
  it('accepts the exact token with the Bearer scheme', () => {
    expect(matchesBearerToken('Bearer s3cret', 's3cret')).toBe(true);
  });

  it('rejects a wrong token, a prefix of the token and other schemes', () => {
    expect(matchesBearerToken('Bearer nope', 's3cret')).toBe(false);
    expect(matchesBearerToken('Bearer s3cre', 's3cret')).toBe(false);
    expect(matchesBearerToken('Basic s3cret', 's3cret')).toBe(false);
    expect(matchesBearerToken(undefined, 's3cret')).toBe(false);
  });
});
