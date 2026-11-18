// Holds one value per loader for ttlMs. Concurrent callers share the in-flight promise,
// and a failed load is dropped so the next call retries.
export function memoizeFor<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let cached: { promise: Promise<T>; expiresAt: number } | null = null;
  return () => {
    if (cached !== null && cached.expiresAt > Date.now()) {
      return cached.promise;
    }
    const promise = load();
    cached = { promise, expiresAt: Date.now() + ttlMs };
    promise.catch(() => {
      cached = null;
    });
    return promise;
  };
}
