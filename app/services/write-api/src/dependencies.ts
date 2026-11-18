import { Signer } from '@aws-sdk/rds-signer';
import type pg from 'pg';
import { pino, type Logger } from 'pino';
import { createPool, createValkeyClient } from '@celestiea/db';
import type { WriteContext } from './http';

// A Lambda instance handles one request at a time, so a tiny pool is enough; RDS Proxy
// multiplexes these connections across all instances.
const lambdaPoolSize = 2;

export function createDependencies(env: NodeJS.ProcessEnv): Omit<WriteContext, 'log'> & {
  logger: Logger;
} {
  return {
    pool: createPool(databaseConfig(env)),
    valkey: env.VALKEY_URL ? createValkeyClient(env.VALKEY_URL) : null,
    logger: pino({ level: env.LOG_LEVEL ?? 'info' }),
  };
}

// Locally a connection string with a password; in AWS IAM authentication to RDS Proxy,
// so the function never holds a database password.
function databaseConfig(env: NodeJS.ProcessEnv): pg.PoolConfig {
  if (env.DATABASE_URL) {
    return { connectionString: env.DATABASE_URL, max: lambdaPoolSize };
  }
  const host = requireEnv(env, 'DATABASE_HOST');
  const user = requireEnv(env, 'DATABASE_USER');
  const port = Number(env.DATABASE_PORT ?? 5432);
  const signer = new Signer({
    hostname: host,
    port,
    username: user,
    region: requireEnv(env, 'AWS_REGION'),
  });
  return {
    host,
    port,
    user,
    database: requireEnv(env, 'DATABASE_NAME'),
    password: () => signer.getAuthToken(),
    ssl: true,
    max: lambdaPoolSize,
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}
