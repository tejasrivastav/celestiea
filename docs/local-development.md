# Local development

## Prerequisites

- git and make. On macOS: `xcode-select --install`.
- Docker with Compose 2.1 or newer.
- Node 22 or 24, and pnpm 10. With Node 22 or 24, `corepack enable` installs the pinned
  pnpm; Node 25 no longer ships corepack, so use `npm install -g pnpm@10` there.
- Ports 5432, 6379 and 8080 free.

`make doctor` checks all of this.

## Run it

```sh
cd app && pnpm install && cd ..
make local                    # postgres, valkey, migrate, read-api, write-api, web, gateway
make seed-local               # full catalog: 303k articles, 1.7M sizes, about a minute
make seed-local SCALE=small   # or about 5k articles in seconds
```

Open http://localhost:8080 for the shop and http://localhost:8080/v1/graphiql for GraphiQL.

```sh
# A listing: sale dresses between €30 and €80, cheapest first
curl -sG localhost:8080/v1/graphql --data-urlencode 'query={
  articles(filter: {category: "women-clothing-dresses", onSale: true, minPriceCents: 3000, maxPriceCents: 8000},
           sort: price_asc, first: 3) {
    nodes { sku productName price { currentCents originalCents discountPct } availableSizes }
    pageInfo { endCursor hasNextPage }
    totalCount { value isCapped }
  }
}'

# A write (token from app/.env.example): put an article on sale
curl -s -X PATCH localhost:8080/v1/articles/<SKU> \
  -H 'authorization: Bearer local-dev-token' -H 'content-type: application/json' \
  -d '{"priceCents": 2999, "originalPriceCents": 4999}'
```

`make test` runs the unit and integration tests against the compose Postgres and Valkey;
`make lint` runs ESLint, Prettier and the type checker.

`make local` starts Postgres 16, Valkey, a one-shot migrator, the read API, the write API
(the Lambda handlers inside a Fastify adapter), the Vite dev server and a Caddy gateway that
routes like API Gateway: `/v1/graphql` to the read API, other `/v1` routes to the write
API, everything else to the UI. The local admin token is `local-dev-token`
(`app/.env.example`).

## Tests and checks

- `make test` runs the unit and integration tests against the compose Postgres and Valkey.
  Each run creates and migrates a fresh `celestiea_test` database.
- `make lint` runs ESLint, Prettier and the type checker.
- `pnpm explain` (in `app/`) prints `EXPLAIN (ANALYZE, BUFFERS)` for the listing queries;
  see [query plans](query-plans.md).
- `k6 run tooling/bench/catalog.k6.js` (in `app/`) runs the load test; see [benchmarks](benchmarks.md).
- `pnpm docs:api` regenerates [schema.graphql](schema.graphql) and [openapi.yaml](openapi.yaml).

`make local-down` stops the stack and keeps the data; `docker compose --project-directory app
down -v` also deletes it.
