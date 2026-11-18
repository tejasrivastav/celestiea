import { DomainError } from '@celestiea/domain';
import {
  createArticle,
  createProduct,
  deleteArticle,
  deleteProduct,
  findProductForAdmin,
  patchArticle,
  patchProduct,
  patchSizeAvailability,
  type Handler,
} from './handlers';
import { problemResponse, type WriteContext, type WriteRequest, type WriteResponse } from './http';

// One Lambda serves all write routes: they share the cold-start cost of the pg pool and
// Valkey client, and writes are too rare to justify a warm function per route
// (docs/adr/0004-read-write-split.md).
const routes: [method: string, pattern: string, handler: Handler][] = [
  ['POST', '/v1/products', createProduct],
  ['PATCH', '/v1/products/:id', patchProduct],
  ['DELETE', '/v1/products/:id', deleteProduct],
  ['POST', '/v1/products/:id/articles', createArticle],
  ['PATCH', '/v1/articles/:sku', patchArticle],
  ['DELETE', '/v1/articles/:sku', deleteArticle],
  ['PATCH', '/v1/articles/:sku/sizes/:sizeLabel', patchSizeAvailability],
  ['GET', '/v1/admin/products', findProductForAdmin],
];

export async function handleRequest(
  request: Omit<WriteRequest, 'params'>,
  context: WriteContext,
): Promise<WriteResponse> {
  try {
    for (const [method, pattern, handler] of routes) {
      const params = method === request.method ? matchPath(pattern, request.path) : null;
      if (params !== null) {
        return await handler({ ...request, params }, context);
      }
    }
    throw new DomainError('not_found', `No route for ${request.method} ${request.path}.`);
  } catch (error) {
    return problemResponse(error, context.log);
  }
}

// Matches on the raw path so an encoded "/" inside a size label ("32%2F34") stays inside
// its segment.
function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternSegments = pattern.split('/');
  const pathSegments = path.split('/');
  if (patternSegments.length !== pathSegments.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const [index, segment] of patternSegments.entries()) {
    const value = pathSegments[index] ?? '';
    if (segment.startsWith(':')) {
      params[segment.slice(1)] = decodeURIComponent(value);
    } else if (segment !== value) {
      return null;
    }
  }
  return params;
}
