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
- Numbers from the deployed dev environment are in the next section.

## Dev on AWS

Dev environment in eu-north-1: CloudFront, API Gateway, one t3.micro ECS host, RDS
db.t4g.micro, no Valkey, small seed (5,066 articles). k6 ran on the same laptop from
outside AWS; the nearest CloudFront edge answered a static file in 8 ms connect and 76 ms
to first byte. Same script as above without the write scenario, measured 2026-11-19:

```sh
cd app && k6 run -e BASE_URL=https://d355y0in4rw4ow.cloudfront.net -e PRODUCT_COUNT=2000 bench/catalog.k6.js
```

| Scenario (latency at the client) | Requests | p50     | p95     | p99     |
| -------------------------------- | -------- | ------- | ------- | ------- |
| Filtered listing                 | 17,575   | 9.6 ms  | 14.4 ms | 26.4 ms |
| Deep pages                       | 10,200   | 8.5 ms  | 12.2 ms | 35.0 ms |
| Product detail, random product   | 7,380    | 16.1 ms | 60.6 ms | 99.4 ms |
| Product detail, 20 hot products  | 21,530   | 8.4 ms  | 11.8 ms | 16.5 ms |

596 requests per second overall, and **95.2% were answered by CloudFront** without
reaching the origin. The client-side numbers therefore mostly measure the edge. What
reached dev, from the API Gateway access logs:

| At the origin (API Gateway latency) | Requests | p50   | p95    | p99    |
| ----------------------------------- | -------- | ----- | ------ | ------ |
| GraphQL cache misses, 200           | 2,212    | 29 ms | 126 ms | 136 ms |
| Throttled, 429                      | 390      |       |        |        |

The 429s (0.68% of all requests) are API Gateway's stage throttle in dev (100 rps steady,
200 burst). Each scenario started with a cold cache and sent a burst of misses above the
burst limit; averaged over the run only about 26 rps reached the origin. The small seed
and random filters from only a few categories make the hit rate higher than real traffic
would; the full seed and a realistic URL mix would lower it.

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
