import { parseArgs } from 'node:util';
import { createPool } from '../pool';
import { generateSeed, type SeedScale } from './generate';
import { loadSeed } from './load';

const { values } = parseArgs({
  options: {
    scale: { type: 'string', default: 'full' },
    out: { type: 'string' },
    'generate-only': { type: 'boolean', default: false },
  },
});

if (values.scale !== 'small' && values.scale !== 'full') {
  throw new Error(`--scale must be "small" or "full", got "${values.scale}"`);
}
const scale: SeedScale = values.scale;
const outDir = values.out ?? `seed-data/${scale}`;

const generationStarted = performance.now();
const counts = await generateSeed(outDir, scale);
const generationSeconds = ((performance.now() - generationStarted) / 1000).toFixed(1);
process.stdout.write(
  `Generated ${JSON.stringify(counts)} into ${outDir} in ${generationSeconds}s\n`,
);

if (!values['generate-only']) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required to load the seed');
  }
  const pool = createPool({ connectionString: databaseUrl });
  const loadStarted = performance.now();
  await loadSeed(pool, outDir);
  await pool.end();
  process.stdout.write(`Loaded in ${((performance.now() - loadStarted) / 1000).toFixed(1)}s\n`);
}
