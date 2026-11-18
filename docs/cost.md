# Cost

**Estimates, not quotes.** On-demand list prices for eu-central-1 as I know them on
2026-11-18, rounded. Check them in the AWS Pricing Calculator before relying on them;
AWS changes prices and free-tier terms.

> Tear down with `make destroy ENV=dev`. The dev kill switch stops the environment when
> the $100 monthly budget is reached, but billing data lags by hours.

## Dev (free-tier sized)

| Item                                                     | Size                                    | Legacy free tier (first 12 months)       | Without free tier     |
| -------------------------------------------------------- | --------------------------------------- | ---------------------------------------- | --------------------- |
| RDS PostgreSQL                                           | db.t4g.micro, 20 GB gp2, single-AZ      | $0                                       | $16                   |
| ECS host                                                 | t3.micro + 30 GB gp3 root volume        | $0                                       | $12                   |
| Public IPv4 on the host                                  | 1 address                               | $0                                       | $3.65                 |
| Internal ALB                                             | 1, minimal LCUs                         | $0                                       | $20                   |
| Secrets Manager                                          | 3 secrets (master, reader, admin token) | $1.20                                    | $1.20                 |
| ECR                                                      | 2 multi-arch repositories, 5 tags each  | ~$0.10                                   | ~$0.10                |
| Lambda, API Gateway, CloudFront, S3, CloudWatch, Budgets | dev traffic                             | $0 (always-free or free-tier allowances) | < $2                  |
| **Total**                                                |                                         | **about $1.30 / month**                  | **about $55 / month** |

Accounts created after July 2025 are on the credit-based Free plan instead of the
12-month tier: usage is billed against the credits, so the "without free tier" column
applies until the credits run out.

## Prod

| Item                                                     | Idle                   | Modest load (about 10 M requests/month, 50% CloudFront hit rate) |
| -------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| Aurora Serverless v2, writer + reader at 0.5 ACU minimum | $102                   | $200 (about 1 ACU average each)                                  |
| RDS Proxy (billed per ACU, 8 ACU minimum)                | $105                   | $105                                                             |
| Interface endpoints: 4 × 2 AZs                           | $70                    | $72                                                              |
| Fargate arm64, 0.5 vCPU / 1 GB tasks                     | $23 (2 tasks)          | $35 (3 tasks average)                                            |
| Internal ALB                                             | $20                    | $25                                                              |
| ElastiCache Serverless Valkey (minimum storage)          | $8                     | $15                                                              |
| API Gateway HTTP API                                     | $0                     | $6                                                               |
| CloudFront (requests + 100 GB out)                       | $0                     | $21                                                              |
| Secrets Manager, CloudWatch (dashboard, alarms, logs)    | $8                     | $12                                                              |
| **Total**                                                | **about $340 / month** | **about $490 / month**                                           |

## Main cost drivers and toggles

- **RDS Proxy** has a fixed minimum of 8 ACU on Aurora Serverless v2, as much as the whole
  database at idle. It earns its place once write bursts open many Lambda connections.
  Below that, capping Lambda concurrency (as dev does) is the cheaper control.
- **NAT Gateway vs. VPC endpoints.** One NAT Gateway is about $38/month plus $0.052/GB
  processed, and a highly available pair about $76. Four interface endpoints in two AZs
  are about $70 with cheaper data processing ($0.01/GB), and they leave the VPC without
  any internet path. Prod uses endpoints for that reason. Dev uses neither: its ECS host
  sits in a public subnet.
- **Aurora minimum ACU** (`min_acu`, default 0.5). Scale-to-zero doesn't help while the
  read API's pool and the proxy keep connections open.
- **Fargate task count** (`desired_count` in the prod root) and size.
- **Valkey** (`module "cache"` in prod; absent in dev). Without it product detail reads go
  to Postgres, about 3x slower in the local benchmark but still tens of milliseconds.
- **WAF** is not deployed; a managed rule set on CloudFront would add about $10/month plus
  request charges.
