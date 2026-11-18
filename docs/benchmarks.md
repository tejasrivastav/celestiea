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

## Prepared statements

The listing query costs more to plan than to execute (about 1 ms to execute against nine
partial indexes). Read paths now use named prepared statements, one per filter
combination and connection. Same machine, listing workload with 8 virtual users and
random categories and sorts, measured 2026-11-19:

|                          | Plain queries  | Prepared statements      |
| ------------------------ | -------------- | ------------------------ |
| Throughput               | 236 rps        | 305–327 rps              |
| Postgres CPU per listing | 7.3 ms         | 4.9 ms                   |
| p50 / p95                | 28.9 / 69.9 ms | 22.5–23.8 / 42.2–45.3 ms |

Writes keep plain queries: behind RDS Proxy a prepared statement pins the client to one
connection and defeats the pooling.

## Capacity estimate

Derived from CPU per request measured locally (docker stats during single-workload k6
runs), not from a test on AWS. Treat it as accurate to within about 2x until the deployed
environment is load tested.

| Per request                  | Read API CPU | Postgres CPU |
| ---------------------------- | ------------ | ------------ |
| Listing (24 tiles), prepared | 2.5 ms       | 4.9 ms       |
| Product detail, Valkey miss  | 1.8 ms       | 3.5 ms       |
| Product detail, Valkey hit   | 1.0 ms       | 0.1 ms       |

Assumptions: Fargate vCPUs and Aurora capacity perform like this laptop's cores, 1 ACU is
about 0.25 vCPU, traffic is 60% listings and 40% product pages with a 70% Valkey hit
rate, and services run at 60–65% CPU.

**Prod as configured (target about 2,000 shopper rps).** With an 80% CloudFront hit rate
about 400 rps reach the origin, which needs 2 read tasks of 1 vCPU and about 8 ACU on the
reader. At a pessimistic 50% hit rate (1,000 origin rps) it needs about 4 tasks and 20 ACU.
Limits: 2 to 8 tasks, `max_acu` 24, API Gateway throttled at 1,500 rps steady and 3,000
burst, Valkey up to 10,000 ECPU per second.

**Dev.** One db.t4g.micro and one t3.micro with burstable CPU (baseline about 0.2 vCPU
each). That sustains roughly 25–40 listing rps, less for random product pages once the
disk's burst credits are used up (100 IOPS baseline on 20 GB gp2). It's meant for
functional testing. Both instances can bill extra for CPU bursts, so load tests against
dev should be short.

Sustained 2,000 rps for a month would cost roughly $8,000, mostly CloudFront and API
Gateway request charges ([cost](cost.md)).
