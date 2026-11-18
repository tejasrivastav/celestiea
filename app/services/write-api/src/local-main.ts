import { createDependencies } from './dependencies';
import { buildLocalServer } from './local-server';

const authToken = process.env.AUTH_TOKEN;
if (!authToken) {
  throw new Error('AUTH_TOKEN is required');
}
const { pool, valkey } = createDependencies(process.env);
const app = buildLocalServer({ pool, valkey }, { authToken, logLevel: process.env.LOG_LEVEL });

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void (async () => {
      await app.close();
      await pool.end();
      valkey?.disconnect();
    })();
  });
}

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3001) });
