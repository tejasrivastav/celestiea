import etag from '@fastify/etag';
import Fastify, { type FastifyInstance } from 'fastify';
import { GraphQLError } from 'graphql';
import mercurius from 'mercurius';
import type pg from 'pg';
import type { Redis } from 'iovalkey';
import { toProblem, type Problem } from '@celestiea/domain';
import { listBrands, listCategories, type BrandRow, type CategoryRow } from '@celestiea/db';
import { cacheControlFor } from './cache-control';
import { memoizeFor } from './memoize';
import { resolvers } from './resolvers';
import { schema } from './schema';

declare module 'mercurius' {
  interface MercuriusContext {
    pool: pg.Pool;
    valkey: Redis | null;
    categories: () => Promise<CategoryRow[]>;
    brands: () => Promise<BrandRow[]>;
  }
}

export interface ReadApiDependencies {
  pool: pg.Pool;
  valkey: Redis | null;
  logLevel?: string;
  enableGraphiql?: boolean;
}

const referenceDataTtlMs = 5 * 60 * 1000;

export async function buildApp({
  pool,
  valkey,
  logLevel = 'info',
  enableGraphiql = false,
}: ReadApiDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: logLevel },
    requestIdHeader: 'x-request-id',
  });
  await app.register(etag);

  // Categories and brands change only with deploys or rare admin edits and are requested
  // on every page, so each task keeps them in memory instead of in Valkey.
  const categories = memoizeFor(referenceDataTtlMs, () => listCategories(pool));
  const brands = memoizeFor(referenceDataTtlMs, () => listBrands(pool));

  await app.register(
    async (v1) => {
      await v1.register(mercurius, {
        schema,
        resolvers,
        path: '/graphql',
        graphiql: enableGraphiql,
        queryDepth: 8,
        context: (_request, reply) => ({ pool, valkey, categories, brands, reply }),
        errorFormatter: (execution, context) => {
          const formatted = mercurius.defaultErrorFormatter(execution, context);
          context.reply.header('cache-control', 'no-store');
          const errors = (execution.errors ?? []).flatMap(unwrapValidationErrors).map((error) => {
            const problem = problemFor(error);
            if (problem.status >= 500) {
              context.reply.log.error({ err: error.originalError ?? error }, 'resolver failed');
            }
            return {
              message: problem.detail,
              locations: error.locations,
              path: error.path,
              extensions: { problem },
            };
          });
          return { statusCode: formatted.statusCode, response: { data: execution.data, errors } };
        },
      });
      v1.graphql.addHook('preExecution', (_schema, document, context) => {
        context.reply.header('cache-control', cacheControlFor(document));
        return Promise.resolve();
      });
    },
    { prefix: '/v1' },
  );

  // Not routed through API Gateway; the ALB health check calls these directly.
  app.get('/health/live', () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ok' };
    } catch (error) {
      reply.log.warn({ err: error }, 'readiness check failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  return app;
}

// Mercurius reports schema validation failures as one error whose originalError holds
// the individual GraphQLErrors.
function unwrapValidationErrors(error: GraphQLError): readonly GraphQLError[] {
  const nested: unknown = (error.originalError as { errors?: unknown } | undefined)?.errors;
  return Array.isArray(nested) ? (nested as GraphQLError[]) : [error];
}

function problemFor(error: GraphQLError): Problem {
  if (error.originalError !== undefined) {
    return toProblem(error.originalError);
  }
  // Syntax and schema validation errors come from graphql-js itself, not a resolver.
  return {
    type: '/problems/invalid-query',
    title: 'Invalid query',
    status: 400,
    detail: error.message,
  };
}
