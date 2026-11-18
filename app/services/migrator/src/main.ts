import { parseArgs } from 'node:util';
import { pino } from 'pino';
import { createPool, enableIamLogin, runMigrations, setRolePassword } from '@celestiea/db';
import { importFromS3, loadSeed } from '@celestiea/seed';

// One image, two one-off jobs run as ECS tasks: `migrate` (every deploy) and
// `import-seed` (on demand). Connection settings come from DATABASE_URL locally and from
// the standard PG* variables in AWS, where ECS injects PGPASSWORD from Secrets Manager.
const logger = pino();
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { bucket: { type: 'string' }, prefix: { type: 'string', default: 'seed/full/' } },
});
const command = positionals[0] ?? 'migrate';

const pool = createPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true',
});

if (command === 'migrate') {
  const applied = await runMigrations(pool);
  await setRolePassword(pool, 'catalog_reader', requireEnv('CATALOG_READER_PASSWORD'));
  // Behind RDS Proxy (prod) the proxy signs in with the writer's password; directly on
  // RDS (dev) the write Lambda signs in with IAM.
  if (process.env.CATALOG_WRITER_IAM_AUTH === 'true') {
    await enableIamLogin(pool, 'catalog_writer');
  } else {
    await setRolePassword(pool, 'catalog_writer', requireEnv('CATALOG_WRITER_PASSWORD'));
  }
  logger.info({ applied }, 'migrations complete');
} else if (command === 'import-seed') {
  if (values.bucket === undefined) {
    throw new Error('import-seed needs --bucket');
  }
  await pool.query('CREATE EXTENSION IF NOT EXISTS aws_s3 CASCADE');
  const startedAt = performance.now();
  await loadSeed(
    pool,
    importFromS3({
      bucket: values.bucket,
      prefix: values.prefix,
      region: requireEnv('AWS_REGION'),
    }),
  );
  logger.info({ seconds: Math.round((performance.now() - startedAt) / 1000) }, 'seed imported');
} else {
  throw new Error(`Unknown command "${command}"; expected migrate or import-seed`);
}
await pool.end();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}
