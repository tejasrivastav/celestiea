# Architecture

## Network (prod)

```mermaid
flowchart LR
    U((Shoppers)) --> CF[CloudFront]
    CF --> UI[(S3 UI bucket)]
    CF --> AG[API Gateway HTTP API]
    AG -- "invoke" --> AU[Authorizer Lambda]
    AU --> SMP[Secrets Manager]

    subgraph VPC["VPC 10.40.0.0/16: private subnets in 2 AZs, no internet gateway, no NAT"]
        VL[VPC link] -- "80" --> ALB[Internal ALB]
        ALB -- "3000" --> R[Read API tasks]
        R -- "5432" --> DB[(Aurora writer + reader)]
        MG[Migrator task] -- "5432" --> DB
        W[Write Lambda] -- "5432, IAM auth" --> P[RDS Proxy]
        P -- "5432" --> DB
        R -- "6379" --> V[(Valkey)]
        W -- "6379" --> V
        subgraph EP["VPC endpoints"]
            ECR[ECR api + dkr]
            LOGS[CloudWatch Logs]
            SM[Secrets Manager]
            S3GW[S3 gateway]
        end
        R -. "443" .-> EP
        MG -. "443" .-> EP
    end

    AG -- "GET/POST /v1/graphql" --> VL
    AG -- "other /v1 routes, invoke" --> W
    S3GW --> LAYERS[(Container image layers, ECR storage in S3)]
```

## Components

| Component                          | Runs on                                   | Code                                       | Talks to                                       |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| Storefront and admin UI            | S3 + CloudFront                           | `app/web`                                  | `/v1/graphql`, `/v1/*`                         |
| Read API (GraphQL)                 | ECS: Fargate in prod, one EC2 host in dev | `app/services/read-api`                    | Postgres reader, Valkey                        |
| Write API (REST)                   | Lambda, in the VPC                        | `app/services/write-api`                   | RDS Proxy (prod) or the instance (dev), Valkey |
| Authorizer                         | Lambda, outside the VPC                   | `app/services/write-api/src/authorizer.ts` | Secrets Manager                                |
| Migrator (seed import in dev only) | One-off ECS task                          | `app/services/migrator`                    | Postgres writer, S3 via `aws_s3` (dev)         |
| Kill switch (dev)                  | Lambda                                    | `app/services/kill-switch`                 | API Gateway, Lambda, ECS, Auto Scaling, RDS    |
| Shared code                        |                                           | `app/packages/domain`, `app/packages/db`   |                                                |

## Caching

**Most reads never reach the backend.** CloudFront serves cacheable GraphQL GETs at the
edge, so the read API and database are sized for cache misses, not for the full 2k rps.

| Layer           | What it holds                      | Lifetime                                                                             | Kept fresh by                          | Dev | Prod |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- | --- | ---- |
| Browser         | GraphQL GET responses              | `max-age` per root field                                                             | ETag revalidation (304)                | yes | yes  |
| CloudFront      | GraphQL GET responses, UI assets   | listings 30 s, products 60 s, plus 10 s `stale-while-revalidate` | expiry only, no invalidation per write | yes | yes  |
| Read API memory | Categories, brands, size charts    | 5 min per task                                                                       | expiry                                 | yes | yes  |
| Valkey          | Product views by id (not listings) | 5 min                                                                                | write-through; tombstone on delete     | no  | yes  |
| Postgres reader | Source for every miss              |                                                                                      |                                        |     |      |

Measured and estimated:

- **CloudFront, measured:** 95.2% of 56,824 requests in the dev load test never reached
  the origin ([benchmarks](benchmarks.md#dev-on-aws)). One client location and a small
  product pool flatter this; capacity planning assumes 80%.
- **Valkey, estimated:** a hit costs 0.1 ms of database CPU instead of 3.5 ms, which is
  about 20% of database load at a 70% hit rate, because listings dominate and are not in
  Valkey. Not deployed in dev, so not yet measured in AWS.
- Why each layer exists and how writes interact with it:
  [ADR 0006](adr/0006-caching-strategy.md).

## Read request

```mermaid
sequenceDiagram
    participant B as Browser
    participant CF as CloudFront
    participant AG as API Gateway
    participant R as Read API (ECS)
    participant V as Valkey
    participant PG as Postgres reader
    B->>CF: GET /v1/graphql?query=…&variables=…
    alt cached and fresh (30 s listings, 60 s products)
        CF-->>B: 200 from edge
    else miss or expired
        CF->>AG: GET /v1/graphql (Authorization header in cache key)
        AG->>R: VPC link → internal ALB, x-request-id added
        opt product detail
            R->>V: GET product:v1:id
        end
        R->>PG: one listing query, or the product aggregate on a cache miss
        R-->>CF: 200 + Cache-Control + ETag
        CF-->>B: 200
    end
```

## Write request

```mermaid
sequenceDiagram
    participant A as Admin UI
    participant CF as CloudFront
    participant AG as API Gateway
    participant AU as Authorizer
    participant W as Write Lambda
    participant P as RDS Proxy
    participant PG as Postgres writer
    participant V as Valkey
    A->>CF: PATCH /v1/products/42 (Bearer token, If-Match "3")
    CF->>AG: forwarded, never cached
    AG->>AU: token check (result cached 5 min)
    AU-->>AG: isAuthorized
    AG->>W: API Gateway v2 event
    W->>P: IAM auth token
    P->>PG: one transaction: lock product, check version, update, copy fields to articles
    W->>V: SET product:v1:42 (fresh view)
    W-->>A: 200 + ETag "4" + updated product
```

## Local stack

`docker compose up` in `app/` runs the same services. A Caddy gateway reproduces the API
Gateway routes, and the write API runs inside a Fastify adapter that mounts the Lambda
router and mimics the authorizer.

```mermaid
flowchart LR
    B[Browser :8080] --> G[Caddy gateway]
    G -- /v1/graphql --> R[read-api]
    G -- other /v1 --> W[write-api adapter]
    G -- / --> UI[Vite dev server]
    M[migrate, one-shot] --> PG[(Postgres 16)]
    R --> PG
    R --> V[(Valkey)]
    W --> PG
    W --> V
```
