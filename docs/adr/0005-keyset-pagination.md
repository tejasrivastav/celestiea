# 0005: Keyset pagination

## Context

Listings are paged (24 per page, up to 96) with "Load more" or infinite scroll, under
concurrent writes.

## Options

- **OFFSET/LIMIT**: simple and allows jumping to page N, but Postgres reads and discards
  every skipped row, and results shift when rows are inserted or re-sorted between pages
  (duplicates or gaps).
- **Keyset (seek)**: continue after the last row's sort key and id.

## Decision

Keyset pagination with an opaque cursor: base64url JSON of the sort, the last row's sort
value (in Postgres' text form, so timestamps keep microseconds) and its id. The query
continues with `(sort_key, id) > ($1, $2)` (or `<` for descending sorts). `id` breaks ties,
so equal prices or popularity never repeat or skip rows. Indexes include `id` in the same
direction as the sort, so the comparison is a single index range. A cursor carries its
sort and is rejected under another one.

Measured on the full seed ([query plans](../query-plans.md)): page 41 of "women" takes
1.1 ms with a cursor; the same listing with `OFFSET` takes 18 ms at 3,840 rows and 141 ms
at 38,400.

## Consequences

No "jump to page 37" and no exact total page count. Totals are a capped count: up to
1,000 is exact and anything above is shown as "1,000+". It only runs when a client asks
for `totalCount`. Exact `COUNT(*)` over a broad category reads most of the table.
