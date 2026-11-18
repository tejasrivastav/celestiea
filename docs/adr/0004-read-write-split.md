# 0004: Read/write split

## Context

Reads vastly outnumber writes. Reads should be fast and steady; writes are rare and
bursty. Both must use the same domain code and database.

## Options

- **All Lambda**: simplest to operate, but cold starts and per-invocation connections
  hurt a steady high read volume, and every read pays Lambda pricing.
- **All containers**: one deployable, warm pools; idle write capacity is paid for and a
  write spike competes with reads for the same tasks.
- **Split**: containers for reads, Lambda for writes.

## Decision

Split. The **read API runs on ECS** (Fargate in prod) with a warm connection pool to the
Aurora reader, in-process reference data and no cold starts, scaling on CPU. The **write
API is one Lambda** with a small router: writes pay per use and can never take read
capacity. One function instead of one per route shares the cold-start setup (pool, Valkey
client) and keeps deployment simple; per-route functions would only pay off with very
different memory or permission needs.

**Routing**: CloudFront routes by path only, so **API Gateway HTTP API** sits behind it:
`/v1/graphql` goes over a VPC link to the internal ALB, every other `/v1` route to the
Lambda behind a bearer-token authorizer. With GraphQL for reads
([0008](0008-graphql-reads-rest-writes.md)) the split became path-based; API Gateway
stays for the authorizer, throttling and a private integration with the ALB.

**RDS Proxy** pools the Lambda's connections. Without it, a burst of Lambda instances
would open a connection each. The Lambda authenticates to the proxy with IAM, so it holds
no password. The free-tier dev environment has no proxy and caps write concurrency at 5
instead.

**Replica lag and read-your-writes**: Aurora reader lag is usually milliseconds but not
zero. Write responses return the full updated product, and the admin UI uses that instead
of re-reading. The admin's SKU lookup is served by the write API from the writer.

**Protection**: write routes require a bearer token from Secrets Manager. Production would
use an API Gateway JWT authorizer with Cognito or an OIDC provider. All routes are
throttled at the stage. An AWS WAF managed rule set on CloudFront was considered and left
out to keep the dev cost near zero; in prod it is a small addition (one `aws_wafv2_web_acl`
in us-east-1 attached to the distribution).

## When to collapse the split

If write volume stays tiny and the team is small, one container service with both routes
is less to operate. If reads become spiky rather than steady, all-Lambda behind CloudFront
caching may be cheaper.
