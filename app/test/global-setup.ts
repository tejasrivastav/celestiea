import type { TestProject } from 'vitest/node';
import { createPool, runMigrations } from '@celestiea/db';

const adminUrl =
  process.env.DATABASE_URL ?? 'postgres://celestiea:celestiea@localhost:5432/celestiea';

// Each run gets a fresh database migrated from scratch, so tests also exercise the
// migrations themselves.
export default async function setup(project: TestProject): Promise<void> {
  const testUrl = new URL(adminUrl);
  testUrl.pathname = '/celestiea_test';

  const admin = createPool({ connectionString: adminUrl });
  await admin.query('DROP DATABASE IF EXISTS celestiea_test WITH (FORCE)');
  await admin.query('CREATE DATABASE celestiea_test');
  await admin.end();

  const pool = createPool({ connectionString: testUrl.toString() });
  await runMigrations(pool);
  await pool.end();

  project.provide('databaseUrl', testUrl.toString());
}
