import { createHash } from 'node:crypto';
import type pg from 'pg';

// A named statement is parsed and planned once per connection and then reused, which
// matters for the listing query: planning it against the partial indexes costs more than
// executing it. Each distinct SQL text (one per filter combination) gets its own name.
// Read paths only: behind RDS Proxy a prepared statement pins the client to one
// connection, so the write path keeps plain queries.
export function prepared(text: string, values: unknown[]): pg.QueryConfig {
  const name = `q_${createHash('sha1').update(text).digest('hex').slice(0, 16)}`;
  return { name, text, values };
}
