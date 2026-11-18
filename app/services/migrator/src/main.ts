import { pino } from 'pino';
import { createPool, runMigrations, setRolePasswords } from '@celestiea/db';

const logger = pino();

const databaseUrl = requireEnv('DATABASE_URL');
const readerPassword = requireEnv('CATALOG_READER_PASSWORD');
const writerPassword = requireEnv('CATALOG_WRITER_PASSWORD');

const pool = createPool({ connectionString: databaseUrl });
const applied = await runMigrations(pool);
await setRolePasswords(pool, { reader: readerPassword, writer: writerPassword });
await pool.end();
logger.info({ applied }, 'migrations complete');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required`);
  }
  return value;
}
