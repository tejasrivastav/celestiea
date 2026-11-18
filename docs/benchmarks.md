# Benchmarks

Recorded with k6 (`app/bench/catalog.k6.js`) against the local compose stack: Caddy
gateway, read API with Valkey, write API local adapter, Postgres 16 with the full seed.
Docker Desktop with 4 vCPUs and 4 GB on a 2017 Intel i7 MacBook Pro, with k6 running on
the same machine. Measured 2026-11-18.

```sh
cd app && k6 run -e BASE_URL=http://localhost:8080 -e TOKEN=local-dev-token bench/catalog.k6.js
```

| Scenario                                                         | Load         | Requests | p50     | p95      | p99      |
| ---------------------------------------------------------------- | ------------ | -------- | ------- | -------- | -------- |
| Filtered listing (random category, sort, sale and price filters) | 10 VUs, 20 s | 5,431    | 31.7 ms | 63.6 ms  | 89.9 ms  |
| Deep pages (20 consecutive cursor pages of "women")              | 5 VUs, 20 s  | 5,580    | 16.4 ms | 29.1 ms  | 43.3 ms  |
| Product detail, cold (random product, Valkey miss)               | 10 VUs, 20 s | 4,446    | 34.8 ms | 104.6 ms | 162.1 ms |
| Product detail, warm (20 hot products, Valkey hit)               | 10 VUs, 20 s | 15,063   | 10.2 ms | 29.3 ms  | 55.8 ms  |
| Write: article price update                                      | 2 VUs, 20 s  | 1,344    | 25.1 ms | 59.4 ms  | 98.7 ms  |

0 failed checks over 31,864 requests.

How to read these:

- The database part of a listing is about 1 ms (see [query plans](query-plans.md)). The
  rest is the gateway, GraphQL execution, JSON and Docker Desktop's virtualized network,
  with load generator and services competing for the same four cores. Treat the numbers
  as relative, not as capacity figures.
- Deep pages are faster than the filtered listing because they repeat one query shape
  without filters; page 20 costs the same as page 1.
- Warm product detail is about 3x faster than cold: a Valkey hit skips the aggregate
  query that builds articles, sizes and images.
- Runs on this laptop vary by up to 2x. An earlier run of the same script measured cold
  product detail at 21 ms p50 and 43 ms p95.
- There are no numbers from AWS yet. They will be added after the first deployment; the
  free-tier dev environment (db.t4g.micro, one t3.micro) is expected to be slower and will
  be labelled as such.
