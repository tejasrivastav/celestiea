# Code tour

A suggested reading order for reviewers: the core logic first, then the services that wrap
it, then setup and configuration. Paths are relative to `app/` unless they start with
`infra/` or `docs/`.

## Where things live

| Kind                    | Paths                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| **Core: read first**    | `packages/domain`, `packages/db`, `services/read-api`, `services/write-api`    |
| UI                      | `web/src`                                                                      |
| Seed data generator     | `packages/seed`                                                                |
| Ops services            | `services/migrator`, `services/kill-switch`                                    |
| Tests and test fixtures | `**/*.test.ts`, `test/`                                                        |
| Infrastructure          | `infra/terraform` (modules, then `envs/dev` and `envs/prod`)                   |
| Dev tooling             | `tooling/` (load tests, local Caddy gateway, bundler, API docs generator)      |
| Config, safe to skip    | `*.config.*`, `tsconfig*.json`, `Dockerfile`s, `docker-compose.yml`, lockfiles |

## 1. Data model

1. `packages/db/migrations/0001_catalog.sql`: products → articles → sizes, the partial
   indexes behind every listing, and the denormalized fields copied onto articles.
   [data model](data-model.md) explains each choice.
2. `packages/db/migrations/0002_roles.sql`: least-privilege reader and writer roles.

## 2. Shared domain types

`packages/domain/src`: no I/O, imported by every service and the UI.

- `listing.ts`: listing filters and sort, validated into an `ArticleListQuery`.
- `cursor.ts`: opaque keyset cursors ([ADR 0005](adr/0005-keyset-pagination.md)).
- `write-requests.ts`: TypeBox schemas for every write body; also the source of
  `docs/openapi.yaml`.
- `views.ts`, `problem.ts`, `errors.ts`: response shapes and the one RFC 9457 problem
  shape shared by REST and GraphQL.

## 3. Reads: listing and product pages

1. `packages/db/src/article-listing.ts`: builds the keyset-paginated listing SQL from
   optional filters (`buildArticleListSql`), plus the capped count.
2. `packages/db/src/product-view.ts`: one product with its articles and sizes.
3. `packages/db/src/product-cache.ts`: Valkey read-through and write-through.
4. `services/read-api/src/schema.ts` → `resolvers.ts` → `cache-control.ts`: the GraphQL
   API and how each query's `Cache-Control` is derived for CloudFront
   ([ADR 0006](adr/0006-caching-strategy.md), [ADR 0008](adr/0008-graphql-reads-rest-writes.md)).
5. `services/read-api/src/app.ts`: Fastify + Mercurius wiring; `main.ts` is startup only.

## 4. Writes: one Lambda, one transaction per request

1. `services/write-api/src/router.ts`: method + path → handler.
2. `services/write-api/src/handlers.ts`: one function per endpoint; each locks the product,
   checks `If-Match` against the aggregate version and applies the change.
3. `services/write-api/src/run-write.ts`: wraps every handler in one transaction, replays
   stored responses for a repeated `Idempotency-Key`, then writes the new view through to
   Valkey.
4. `packages/db/src/product-writes.ts`, `transaction.ts`, `idempotency.ts`: the SQL behind it.
5. `services/write-api/src/authorizer.ts`, `auth-token.ts`: the bearer-token authorizer.
6. `lambda.ts` adapts API Gateway events; `local-server.ts` runs the same handlers locally.

## 5. Tests worth reading

- `services/write-api/src/writes.test.ts`: versioning, idempotency and denormalization end
  to end against Postgres.
- `services/read-api/src/app.test.ts`: GraphQL queries and cache headers.
- `packages/db/src/article-listing.test.ts`, `packages/domain/src/cursor.test.ts`:
  pagination stability.

## 6. UI

`web/src/api/` holds the typed clients; `pages/CatalogPage.tsx` and `ProductPage.tsx` are the
shopper views, `pages/admin/` the product editor.

## 7. Infrastructure

`infra/terraform/envs/dev/main.tf` and `envs/prod/main.tf` show how the modules are composed;
read them before the modules. `modules/observability` holds the budget alerts and the dev
kill switch. See [architecture](architecture.md) and [deployment](deployment.md).
