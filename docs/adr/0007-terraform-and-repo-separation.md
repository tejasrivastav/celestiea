# 0007: Terraform, repository layout and environments

## Context

Infrastructure must be reproducible and reviewable, and kept apart from application code.
A dev environment must run within the AWS free tier while prod shows the intended design.

## Decision

- **Terraform** (≥ 1.11) with S3 remote state and native S3 locking (`use_lockfile`).
  A `bootstrap/` root (local state) creates the state bucket, the ECR repositories (images
  are pushed before `apply`). Deploys run from a laptop; CI only runs checks and holds no
  AWS credentials.
- **`app/` and `infra/` never import each other.** Infra receives build artifacts only as
  variables: image tags and Lambda zip paths. The Makefile builds
  the artifacts and pass them in.
- Small modules with one responsibility (network, database, cache, read service,
  migrator, write API, API Gateway, edge, observability). All security group rules live in
  one table in the network module, so least privilege can be reviewed in one place.
- Secrets that Terraform generates (database role passwords, the admin token) are
  **write-only** values: written to Secrets Manager, never stored in state.

**Two environments from the same modules:**

|          | prod                                                  | dev (free tier)                                                 |
| -------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Database | Aurora writer + reader, RDS Proxy (`database-aurora`) | one RDS db.t4g.micro, IAM auth from the Lambda (`database-rds`) |
| Read API | Fargate arm64, 2 to 6 tasks                           | ECS on one t3.micro, host networking                            |
| Cache    | Valkey Serverless                                     | none                                                            |
| Egress   | interface endpoints, no internet path                 | public subnet for the ECS host only                             |
| Budget   | alerts                                                | alerts and kill switch (soft stop)                              |

The two database modules expose the same outputs, so the rest of the wiring is identical.

## Consequences

Dev is not a faithful performance replica of prod, and its ECS host has a public IP
(ingress is limited to the ALB). Dev deploys have a short gap because the single host
can't run two tasks on port 3000. Prod costs about $340 a month at idle ([cost](../cost.md)) and is deployed
only by hand.
