import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type {
  APIGatewayRequestAuthorizerEventV2,
  APIGatewaySimpleAuthorizerResult,
} from 'aws-lambda';
import { matchesBearerToken } from './auth-token';

// MVP protection for write routes: one shared bearer token from Secrets Manager. A real
// deployment would use an API Gateway JWT authorizer backed by Cognito or an OIDC IdP.
let expectedToken: Promise<string> | undefined;

export async function handler(
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewaySimpleAuthorizerResult> {
  expectedToken ??= loadToken();
  return { isAuthorized: matchesBearerToken(event.headers?.authorization, await expectedToken) };
}

async function loadToken(): Promise<string> {
  const secretId = process.env.AUTH_TOKEN_SECRET_ARN;
  if (secretId === undefined) {
    throw new Error('AUTH_TOKEN_SECRET_ARN is required');
  }
  const secret = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  if (secret.SecretString === undefined) {
    throw new Error('The auth token secret has no string value');
  }
  return secret.SecretString;
}
