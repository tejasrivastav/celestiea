import { createPool, createValkeyClient } from '@celestiea/db';
import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig(process.env);
const pool = createPool({
  connectionString: config.databaseUrl,
  max: config.databasePoolSize,
  ssl: config.databaseSsl,
});
const valkey = config.valkeyUrl === null ? null : createValkeyClient(config.valkeyUrl);

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
