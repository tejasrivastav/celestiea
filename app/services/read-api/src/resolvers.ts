import type { IResolvers, MercuriusContext } from 'mercurius';
import {
  parseArticleListQuery,
  parseProductId,
  toPublicProductView,
  type ArticleListInput,
  type ArticleListQuery,
  type ProductView,
} from '@celestiea/domain';
import {
  countArticles,
  fillProductCache,
  findProductIdByArticleSku,
  findProductView,
  getCachedProduct,
  listArticles,
} from '@celestiea/db';

interface ArticleConnectionSource {
  query: ArticleListQuery;
}

export const resolvers: IResolvers = {
  Query: {
    async articles(_root: unknown, args: ArticleListInput, context: MercuriusContext) {
      const query = parseArticleListQuery(args);
      const page = await listArticles(context.pool, query);
      return {
        query,
        nodes: page.nodes,
        pageInfo: { endCursor: page.endCursor, hasNextPage: page.hasNextPage },
      };
    },
    async product(_root: unknown, args: { id: string }, context: MercuriusContext) {
      return loadPublicProduct(context, parseProductId(args.id));
    },
    async productByArticleSku(_root: unknown, args: { sku: string }, context: MercuriusContext) {
      const productId = await findProductIdByArticleSku(context.pool, args.sku);
      return productId === null ? null : loadPublicProduct(context, productId);
    },
    categories(_root: unknown, _args: unknown, context: MercuriusContext) {
      return context.categories();
    },
    brands(_root: unknown, _args: unknown, context: MercuriusContext) {
      return context.brands();
    },
    sizeCharts(_root: unknown, _args: unknown, context: MercuriusContext) {
      return context.sizeCharts();
    },
  },
  // Resolved only when a client selects it, so plain listing requests skip the count.
  ArticleConnection: {
    totalCount(connection: ArticleConnectionSource, _args: unknown, context: MercuriusContext) {
      return countArticles(context.pool, connection.query);
    },
  },
};

// Valkey is an optimisation: when it is disabled or unreachable, reads go to Postgres.
async function loadPublicProduct(
  context: MercuriusContext,
  productId: number,
): Promise<ProductView | null> {
  const { valkey, pool, reply } = context;
  if (valkey !== null) {
    try {
      const cached = await getCachedProduct(valkey, productId);
      if (cached !== null) {
        return toPublicProductView(cached);
      }
    } catch (error) {
      reply.log.warn({ err: error }, 'product cache read failed');
    }
  }

  const view = await findProductView(pool, productId);
  if (view === null) {
    return null;
  }
  if (valkey !== null) {
    fillProductCache(valkey, view).catch((error: unknown) => {
      reply.log.warn({ err: error }, 'product cache fill failed');
    });
  }
  return toPublicProductView(view);
}
