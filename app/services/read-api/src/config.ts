export interface ReadApiConfig {
  port: number;
  // Unset in AWS: pg then reads PGHOST, PGUSER, PGPASSWORD and PGDATABASE.
  databaseUrl: string | undefined;
  databasePoolSize: number;
  // Aurora requires TLS; the image trusts the RDS CA bundle via NODE_EXTRA_CA_CERTS.
  databaseSsl: boolean;
  valkeyUrl: string | null;
  logLevel: string;
  enableGraphiql: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv): ReadApiConfig {
  if (!env.DATABASE_URL && !env.PGHOST) {
    throw new Error('DATABASE_URL or PGHOST is required');
  }
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: env.DATABASE_URL || undefined,
    databasePoolSize: Number(env.DATABASE_POOL_SIZE ?? 10),
    databaseSsl: env.DATABASE_SSL === 'true',
    valkeyUrl: env.VALKEY_URL || null,
    logLevel: env.LOG_LEVEL ?? 'info',
    enableGraphiql: env.ENABLE_GRAPHIQL === 'true',
  };
}
