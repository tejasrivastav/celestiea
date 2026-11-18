import { inject, describe, expect, it, afterAll } from 'vitest';
import {
  colorFamilies,
  imageKinds,
  publicationStatuses,
  sizeAvailabilities,
  sizeSystems,
  targetGroups,
} from '@celestiea/domain';
import { createPool } from './pool';

const pool = createPool({ connectionString: inject('databaseUrl') });
afterAll(() => pool.end());

async function enumValues(typeName: string): Promise<string[]> {
  const { rows } = await pool.query<{ value: string }>(
    `SELECT e.enumlabel AS value
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = $1
      ORDER BY e.enumsortorder`,
    [typeName],
  );
  return rows.map((row) => row.value);
}

describe('schema', () => {
  it('declares the same enum values as the domain package', async () => {
    expect(await enumValues('target_group')).toEqual([...targetGroups]);
    expect(await enumValues('publication_status')).toEqual([...publicationStatuses]);
    expect(await enumValues('color_family')).toEqual([...colorFamilies]);
    expect(await enumValues('size_system')).toEqual([...sizeSystems]);
    expect(await enumValues('size_availability')).toEqual([...sizeAvailabilities]);
    expect(await enumValues('image_kind')).toEqual([...imageKinds]);
  });
});
