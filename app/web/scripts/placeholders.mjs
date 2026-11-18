// Writes one placeholder SVG per colour family and image kind into public/, matching the
// URLs the seed data uses (/images/placeholder/<family>-<kind>.svg). No real product
// photography is used or hotlinked.
import { mkdir, writeFile } from 'node:fs/promises';
import { URL } from 'node:url';

const swatches = {
  black: '#232326',
  white: '#f2f0eb',
  grey: '#9a9a9f',
  blue: '#5b84c4',
  navy: '#24345c',
  red: '#b8343a',
  pink: '#e3a3b6',
  green: '#3f6e4f',
  khaki: '#8a8556',
  beige: '#d9c7a7',
  brown: '#7a5236',
  yellow: '#e5c14c',
  orange: '#d97a3a',
  purple: '#7d5b9e',
  multicolour: '#c08a5b',
};
const kinds = ['packshot', 'model', 'detail'];
const outDir = new URL('../public/images/placeholder/', import.meta.url);

function svg(color, kind) {
  const shapes = {
    packshot: `<path d="M300 220l100-60h0l100 60 90 80-60 70-40-30v460H310V340l-40 30-60-70z" fill="${color}"/>`,
    model: `<circle cx="400" cy="250" r="70" fill="#d8cfc4"/><path d="M290 340h220l40 520H250z" fill="${color}"/>`,
    detail: `<circle cx="400" cy="550" r="230" fill="${color}"/><circle cx="400" cy="550" r="12" fill="#00000033"/>`,
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100" viewBox="0 0 800 1100"><rect width="800" height="1100" fill="#ece7df"/>${shapes[kind]}</svg>\n`;
}

await mkdir(outDir, { recursive: true });
for (const [family, color] of Object.entries(swatches)) {
  for (const kind of kinds) {
    await writeFile(new URL(`${family}-${kind}.svg`, outDir), svg(color, kind));
  }
}
