import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

let handler: typeof import('./lambda').handler;

beforeAll(async () => {
  process.env.DATABASE_URL = inject('databaseUrl');
  process.env.LOG_LEVEL = 'silent';
  ({ handler } = await import('./lambda'));
});
afterAll(() => {
  delete process.env.DATABASE_URL;
});

function apiGatewayEvent(method: string, rawPath: string, body?: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${rawPath}`,
    rawPath,
    rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-request-id': 'test-request' },
    body,
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api',
      domainName: 'example.execute-api.eu-central-1.amazonaws.com',
      domainPrefix: 'example',
      http: {
        method,
        path: rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'lambda-request',
      routeKey: `${method} ${rawPath}`,
      stage: '$default',
      time: '18/Nov/2026:12:00:00 +0000',
      timeEpoch: 1_795_000_000_000,
    },
  };
}

describe('Lambda handler', () => {
  it('handles an API Gateway v2 event without the local adapter', async () => {
    const result = await handler(apiGatewayEvent('PATCH', '/v1/products/999999', '{"name":"x"}'));

    expect(result.statusCode).toBe(400);
    expect(result.headers).toEqual({ 'content-type': 'application/problem+json' });
    expect(JSON.parse(result.body ?? '')).toMatchObject({ type: '/problems/validation-failed' });
  });

  it('returns 404 problem details for an unknown route', async () => {
    const result = await handler(apiGatewayEvent('POST', '/v1/nothing-here', '{}'));

    expect(result.statusCode).toBe(404);
  });
});
