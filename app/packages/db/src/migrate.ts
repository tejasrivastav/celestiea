import { readdir, readFile } from 'node:fs/promises';
import type pg from 'pg';

// Resolved relative to this module. The migrator bundle keeps the same layout
// (dist/ next to migrations/), so the path holds in both source and image.
const migrationsDir = new URL('../migrations/', import.meta.url);

// Arbitrary constant shared by all migrator runs, so concurrent runs queue up.
const migrationLockId = 7_301_001;

export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const appliedNames = new Set(applied.rows.map((row) => row.name));
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

    const newlyApplied: string[] = [];
    for (const file of files) {
      if (appliedNames.has(file)) {
        continue;
      }
      const sql = await readFile(new URL(file, migrationsDir), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      newlyApplied.push(file);
    }
    return newlyApplied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]);
    client.release();
  }
}

export async function setRolePasswords(
  pool: pg.Pool,
  passwords: { reader: string; writer: string },
): Promise<void> {
  const client = await pool.connect();
  try {
    const reader = client.escapeLiteral(passwords.reader);
    const writer = client.escapeLiteral(passwords.writer);
    await client.query(`ALTER ROLE catalog_reader WITH LOGIN PASSWORD ${reader}`);
    await client.query(`ALTER ROLE catalog_writer WITH LOGIN PASSWORD ${writer}`);
  } finally {
    client.release();
  }
}
