import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createDependencies } from './dependencies';
import { handleRequest } from './router';

// Created on the first invocation and reused while the instance stays warm.
let dependencies: ReturnType<typeof createDependencies> | undefined;

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  dependencies ??= createDependencies(process.env);
  const { pool, valkey, logger } = dependencies;
  const requestId = event.headers['x-request-id'] ?? event.requestContext.requestId;

  const response = await handleRequest(
    {
      method: event.requestContext.http.method,
      path: event.rawPath,
      query: new URLSearchParams(event.rawQueryString),
      headers: event.headers,
      body: decodeBody(event),
    },
    { pool, valkey, log: logger.child({ requestId }) },
  );
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body === undefined ? '' : JSON.stringify(response.body),
  };
}

function decodeBody(event: APIGatewayProxyEventV2): string | null {
  if (event.body === undefined) {
    return null;
  }
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}
