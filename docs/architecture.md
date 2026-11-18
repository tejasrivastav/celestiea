# Architecture

## Components

| Component                | Runs on                                   | Code                                       | Talks to                                       |
| ------------------------ | ----------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| Storefront and admin UI  | S3 + CloudFront                           | `app/web`                                  | `/v1/graphql`, `/v1/*`                         |
| Read API (GraphQL)       | ECS: Fargate in prod, one EC2 host in dev | `app/services/read-api`                    | Postgres reader, Valkey                        |
| Write API (REST)         | Lambda, in the VPC                        | `app/services/write-api`                   | RDS Proxy (prod) or the instance (dev), Valkey |
| Authorizer               | Lambda, outside the VPC                   | `app/services/write-api/src/authorizer.ts` | Secrets Manager                                |
| Migrator and seed import | One-off ECS task                          | `app/services/migrator`                    | Postgres writer, S3 via `aws_s3`               |
| Kill switch (dev)        | Lambda                                    | `app/services/kill-switch`                 | API Gateway, Lambda, ECS, Auto Scaling, RDS    |
| Shared code              |                                           | `app/packages/domain`, `app/packages/db`   |                                                |

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
    S3GW --> SEED[(S3 seed bucket and ECR layers)]
    DB -. "aws_s3 import" .-> S3GW
```

Two AZs, private subnets only, no internet gateway or NAT. ECR, CloudWatch Logs and
Secrets Manager are reached through interface endpoints, S3 through a gateway endpoint.
The ALB is internal and reachable only from the API Gateway VPC link. Security group rules
(one table in `infra/terraform/modules/network/main.tf`):

| From                   | To                                 | Port |
| ---------------------- | ---------------------------------- | ---- |
| VPC link               | ALB                                | 80   |
| ALB                    | read API                           | 3000 |
| read API, migrator     | database                           | 5432 |
| write Lambda           | RDS Proxy (prod) or database (dev) | 5432 |
| RDS Proxy              | database                           | 5432 |
| read API, write Lambda | Valkey                             | 6379 |
| VPC                    | interface endpoints                | 443  |
