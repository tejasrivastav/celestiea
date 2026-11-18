// Bundles service entry points into single ESM files: node bundle.mjs <outdir> <entry...>
import process from 'node:process';
import { build } from 'esbuild';

const [outdir, ...entryPoints] = process.argv.slice(2);

await build({
  entryPoints,
  outdir,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  minify: true,
  sourcemap: true,
  // pg-native is an optional pg backend we don't use. The Lambda Node.js runtime ships
  // the Secrets Manager client, so the authorizer bundle stays tiny.
  external: ['pg-native', '@aws-sdk/client-secrets-manager'],
  // CommonJS dependencies inside the ESM bundle still call require() and read __dirname.
  banner: {
    js: [
      "import { createRequire } from 'node:module';",
      "import { dirname as __bundleDirname } from 'node:path';",
      "import { fileURLToPath as __bundleFileUrlToPath } from 'node:url';",
      'const require = createRequire(import.meta.url);',
      'const __filename = __bundleFileUrlToPath(import.meta.url);',
      'const __dirname = __bundleDirname(__filename);',
    ].join(' '),
  },
});
