import { Redis } from 'iovalkey';
import { createPool } from '@celestiea/db';
import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig(process.env);
const pool = createPool({ connectionString: config.databaseUrl, max: config.databasePoolSize });
// Fail fast when Valkey is down: a slow cache must not slow reads that Postgres can serve.
const valkey =
  config.valkeyUrl === null
    ? null
    : new Redis(config.valkeyUrl, {
        commandTimeout: 100,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });

const app = await buildApp({
  pool,
  valkey,
  logLevel: config.logLevel,
  enableGraphiql: config.enableGraphiql,
});

// ECS deregisters the task from the ALB before sending SIGTERM, so by now no new requests
// arrive; close() waits for in-flight ones before the pool is released.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await pool.end();
      valkey?.disconnect();
    })();
  });
}

await app.listen({ host: '0.0.0.0', port: config.port });
