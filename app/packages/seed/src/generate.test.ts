import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateSeed } from './generate';

describe('seed generator', () => {
  it('produces identical files on every run', async () => {
    const first = await mkdtemp(join(tmpdir(), 'seed-'));
    const second = await mkdtemp(join(tmpdir(), 'seed-'));

    await generateSeed(first, 'small');
    await generateSeed(second, 'small');

    for (const file of await readdir(first)) {
      expect(await readFile(join(second, file))).toEqual(await readFile(join(first, file)));
    }
  });
});
