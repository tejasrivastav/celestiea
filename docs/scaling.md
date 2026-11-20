# Scaling path

Described, not built. The current limits and what changes at about 2,000 requests per
second are in the [capacity estimate](benchmarks.md#capacity-estimate).

1. More Aurora readers and more read tasks; the read API is stateless apart from a
   5-minute memo of reference data.
2. Longer CloudFront lifetimes (`stale-while-revalidate` is already on) and origin shield; trusted
   documents (persisted queries) so only known GraphQL queries run.
3. When attribute filters, facet counts on any filter combination, full-text search, typo
   tolerance or personalization are needed: project articles into **OpenSearch or
   Typesense** through a **transactional outbox → EventBridge or SQS → indexer Lambda** (or
   CDC from the WAL). Postgres stays the source of truth and keeps serving product detail
   and writes.
4. International traffic: Aurora Global Database with read APIs per region
   ([ADR 0009](adr/0009-cross-region.md)).
5. Partitioning `articles` and `article_sizes` only at orders of magnitude more data; at
   300k articles every listing is an index range.
