import { Kind, OperationTypeNode, type DocumentNode } from 'graphql';

// CloudFront and browsers cache GET queries for the shortest lifetime of any root field
// requested. Writes never invalidate CloudFront, so these values are the accepted
// staleness window (docs/adr/0006-caching-strategy.md).
// After expiry CloudFront may serve the old response this long while it refetches, so
// hot keys don't send a burst of misses to the origin. It adds to the staleness window.
const staleWhileRevalidateSeconds = 10;

const maxAgeByRootField: Record<string, number> = {
  articles: 30,
  product: 60,
  productByArticleSku: 60,
  categories: 3600,
  brands: 3600,
  sizeCharts: 3600,
};

export function cacheControlFor(document: DocumentNode): string {
  const maxAges: number[] = [];
  for (const definition of document.definitions) {
    if (
      definition.kind !== Kind.OPERATION_DEFINITION ||
      definition.operation !== OperationTypeNode.QUERY
    ) {
      continue;
    }
    for (const selection of definition.selectionSet.selections) {
      if (selection.kind !== Kind.FIELD) {
        return 'no-store';
      }
      const maxAge = maxAgeByRootField[selection.name.value];
      if (maxAge === undefined) {
        return 'no-store';
      }
      maxAges.push(maxAge);
    }
  }
  if (maxAges.length === 0) {
    return 'no-store';
  }
  const maxAge = Math.min(...maxAges);
  return `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;
}
