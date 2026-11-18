import { createHash, timingSafeEqual } from 'node:crypto';

// Hashing first gives both sides equal length, which timingSafeEqual requires, without
// leaking the expected token's length through an early return.
export function matchesBearerToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  const match = /^Bearer (.+)$/.exec(authorization ?? '');
  if (match === null) {
    return false;
  }
  const digest = (token: string) => createHash('sha256').update(token).digest();
  return timingSafeEqual(digest(match[1] ?? ''), digest(expectedToken));
}
