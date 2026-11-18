import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import type pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { seedFileName, seedTables } from './tables';

type SeedTable = (typeof seedTables)[number];
export type CopyTable = (client: pg.ClientBase, table: SeedTable) => Promise<void>;

// Locally: stream each gzipped CSV from disk into COPY ... FROM STDIN.
export function copyFromDirectory(dir: string): CopyTable {
  return async (client, table) => {
    const copy = client.query(
      copyFrom(`COPY ${table.name} (${table.columns.join(', ')}) FROM STDIN WITH (FORMAT csv)`),
    );
    await pipeline(createReadStream(join(dir, seedFileName(table.name))), createGunzip(), copy);
  };
}

// In AWS: Aurora reads the same files from S3 itself through the aws_s3 extension, so the
// data never passes through the migrator task. Objects are uploaded with
// Content-Encoding: gzip, which the extension decompresses.
export function importFromS3(location: {
  bucket: string;
  prefix: string;
  region: string;
}): CopyTable {
  return async (client, table) => {
    await client.query(
      `SELECT aws_s3.table_import_from_s3(
                $1, $2, '(FORMAT csv)', aws_commons.create_s3_uri($3, $4, $5))`,
      [
        table.name,
        table.columns.join(','),
        location.bucket,
        `${location.prefix}${seedFileName(table.name)}`,
        location.region,
      ],
    );
  };
}

export async function loadSeed(pool: pg.Pool, copyTable: CopyTable): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `TRUNCATE ${seedTables.map((table) => table.name).join(', ')}, idempotency_keys CASCADE`,
    );
    const foreignKeyDefinitions = await dropForeignKeys(client);
    const indexDefinitions = await dropSecondaryIndexes(client);
    for (const table of seedTables) {
      await copyTable(client, table);
    }
    for (const definition of [...indexDefinitions, ...foreignKeyDefinitions]) {
      await client.query(definition);
    }
    await resetIdentitySequences(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  await pool.query('ANALYZE');
}

// Foreign keys are checked by a trigger per row during COPY. Re-adding them after the
// load validates each constraint with one join instead, so integrity is still checked.
async function dropForeignKeys(client: pg.ClientBase): Promise<string[]> {
  const { rows } = await client.query<{ tableName: string; name: string; definition: string }>(
    `SELECT c.conrelid::regclass::text AS "tableName",
            c.conname AS name,
            pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
      WHERE c.contype = 'f'
        AND c.conrelid::regclass::text = ANY($1)`,
    [seedTables.map((table) => table.name)],
  );
  for (const foreignKey of rows) {
    await client.query(
      `ALTER TABLE ${foreignKey.tableName} DROP CONSTRAINT ${client.escapeIdentifier(foreignKey.name)}`,
    );
  }
  return rows.map(
    (foreignKey) =>
      `ALTER TABLE ${foreignKey.tableName} ADD CONSTRAINT ${client.escapeIdentifier(foreignKey.name)} ${foreignKey.definition}`,
  );
}

// Building an index once after the load is several times faster than maintaining it
// row by row during COPY. Constraint-backed indexes (primary keys, unique) stay, so
// the load still rejects duplicate SKUs and GTINs.
async function dropSecondaryIndexes(client: pg.ClientBase): Promise<string[]> {
  const { rows } = await client.query<{ name: string; definition: string }>(
    `SELECT i.indexname AS name, i.indexdef AS definition
       FROM pg_indexes i
      WHERE i.schemaname = 'public'
        AND i.tablename = ANY($1)
        AND NOT EXISTS (SELECT FROM pg_constraint c WHERE c.conname = i.indexname)`,
    [seedTables.map((table) => table.name)],
  );
  for (const index of rows) {
    await client.query(`DROP INDEX ${client.escapeIdentifier(index.name)}`);
  }
  return rows.map((index) => index.definition);
}

// Rows were loaded with explicit ids, so the identity sequences must continue after them.
export async function resetIdentitySequences(client: pg.ClientBase): Promise<void> {
  for (const table of seedTables) {
    if (!(table.columns as readonly string[]).includes('id')) {
      continue;
    }
    await client.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), coalesce(max(id), 0) + 1, false) FROM ${table.name}`,
      [table.name],
    );
  }
}
