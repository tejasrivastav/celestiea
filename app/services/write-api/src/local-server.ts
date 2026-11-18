import Fastify, { type FastifyInstance } from 'fastify';
import { matchesBearerToken } from './auth-token';
import type { WriteContext } from './http';
import { handleRequest } from './router';

// Serves the Lambda router over HTTP for docker compose and tests. It reproduces what API
// Gateway does in front of the function: the authorizer check and its 401/403 bodies.
export function buildLocalServer(
  context: Omit<WriteContext, 'log'>,
  { authToken, logLevel = 'info' }: { authToken: string; logLevel?: string },
): FastifyInstance {
  const app = Fastify({ logger: { level: logLevel }, requestIdHeader: 'x-request-id' });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'string' }, (_request, body, done) => done(null, body));

  app.all('/*', async (request, reply) => {
    const authorization = request.headers.authorization;
    if (authorization === undefined) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }
    if (!matchesBearerToken(authorization, authToken)) {
      return reply.code(403).send({ message: 'Forbidden' });
    }

    const [path = '', rawQuery = ''] = request.raw.url?.split('?') ?? [];
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries(request.headers)) {
      headers[name] = Array.isArray(value) ? value.join(',') : value;
    }
    const response = await handleRequest(
      {
        method: request.method,
        path,
        query: new URLSearchParams(rawQuery),
        headers,
        body: typeof request.body === 'string' ? request.body : null,
      },
      { ...context, log: request.log },
    );
    return reply
      .code(response.status)
      .headers(response.headers)
      .send(response.body === undefined ? undefined : JSON.stringify(response.body));
  });

  return app;
}
