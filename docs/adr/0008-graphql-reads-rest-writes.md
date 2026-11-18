# 0008: GraphQL for reads, REST for writes

## Context

The original plan was REST for both sides. Clients render listings, product pages and
reference data with different field needs, and the storefront wants few round trips.

## Decision

- **Reads are GraphQL** (Mercurius on Fastify), schema-first. Queries go over **GET**, so
  CloudFront and browsers can cache them by URL. Lifetimes follow the root fields
  ([0006](0006-caching-strategy.md)). Listings are a connection with `nodes`, `pageInfo`
  and an on-demand capped `totalCount`. Query depth is limited.
- **Writes stay REST** on the Lambda. `If-Match`/412, `Idempotency-Key`, `201 Location`
  and `204` are HTTP semantics that GraphQL mutations would have to reinvent, and a second
  GraphQL server in Lambda would add cold-start weight.
- **One error shape**: domain errors become RFC 9457 problem details, as the REST body and
  inside `errors[].extensions.problem` in GraphQL. A test compares the two.
- Enum values use the database's snake_case spelling on both surfaces, so there's no
  mapping layer.
- Resolvers call repository functions that return fully shaped tiles and product views,
  so there are no per-field queries (no N+1) and no DataLoader.

## Consequences

Two API styles to document (`docs/schema.graphql`, `docs/openapi.yaml`). Arbitrary
queries can still be expensive. In production, **trusted documents** (a persisted-query
allowlist generated from the UI build) would close that and make GET URLs shorter.
