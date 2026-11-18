export interface ReadApiConfig {
  port: number;
  databaseUrl: string;
  databasePoolSize: number;
  valkeyUrl: string | null;
  logLevel: string;
  enableGraphiql: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv): ReadApiConfig {
  const databaseUrl = env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === '') {
    throw new Error('DATABASE_URL is required');
  }
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl,
    databasePoolSize: Number(env.DATABASE_POOL_SIZE ?? 10),
    valkeyUrl: env.VALKEY_URL || null,
    logLevel: env.LOG_LEVEL ?? 'info',
    enableGraphiql: env.ENABLE_GRAPHIQL === 'true',
  };
}
