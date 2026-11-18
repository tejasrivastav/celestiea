import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';

export type CsvValue = string | number | boolean | null | string[] | object;

// Matches Postgres COPY ... (FORMAT csv): an unquoted empty field is NULL, so empty
// strings are always quoted. Arrays use the Postgres array literal.
function encodeValue(value: CsvValue): string {
  if (value === null) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const elements: string[] = value;
    return quote(`{${elements.map((element) => `"${element.replaceAll('"', '\\"')}"`).join(',')}}`);
  }
  if (typeof value === 'object') {
    return quote(JSON.stringify(value));
  }
  return quote(value);
}

function quote(text: string): string {
  return `"${text.replaceAll('"', '""')}"`;
}

export function createCsvWriter(path: string) {
  const gzip = createGzip();
  const file = createWriteStream(path);
  gzip.pipe(file);

  // Rows are buffered because one gzip write per row dominates generation time.
  let buffer = '';
  async function flush(): Promise<void> {
    const chunk = buffer;
    buffer = '';
    if (!gzip.write(chunk)) {
      await once(gzip, 'drain');
    }
  }

  return {
    async write(row: CsvValue[]): Promise<void> {
      buffer += `${row.map(encodeValue).join(',')}\n`;
      if (buffer.length > 65_536) {
        await flush();
      }
    },
    async close(): Promise<void> {
      await flush();
      gzip.end();
      await once(file, 'finish');
    },
  };
}
