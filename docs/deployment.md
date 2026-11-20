# Deploying to AWS

Everything runs in eu-north-1 and is deployed from a laptop with `make`. Every target
below creates, changes or deletes billable resources.

## Prerequisites

On top of the [local prerequisites](local-development.md#prerequisites): AWS CLI v2,
Terraform 1.11 or newer, Docker buildx, jq, zip and curl. `make doctor` lists them.

- Sign in with `aws login --profile celestiea`. The Makefile uses that profile by default;
  pass `AWS_PROFILE=<yours>` to use another.
- Commands run outside `make` (like the admin token below) need the profile in your shell:
  `export AWS_PROFILE=celestiea`. Without it the AWS CLI and Terraform fall back to the
  default profile, and Terraform fails with `InvalidClientTokenId`.
- New AWS accounts can run only 10 Lambda functions at once in total. Dev reserves none,
  but prod reserves 20 for the write API, so request a higher "Concurrent executions" quota
  in Service Quotas before deploying prod.

## Deploy

```sh
make bootstrap                                   # once per account: state bucket and ECR repositories
make deploy ENV=dev ALERT_EMAIL=you@example.com  # build, push, apply, migrate, publish UI, smoke test
make seed ENV=dev SCALE=small                    # or SCALE=full; generated locally, imported inside the VPC
```

`make deploy` builds both Lambda zips and multi-architecture images tagged with the git SHA,
pushes the images to ECR, runs `terraform apply` with those artifacts as variables, runs the
migrator as a one-off ECS task, restarts the read service, uploads the UI (hashed assets
immutable, `index.html` revalidated and invalidated) and smoke-tests the CloudFront URL.

After the first deploy, confirm the SNS subscription email; budget and alarm notifications
go to that address.

`make seed` refuses `ENV=prod`: synthetic data is for dev only.

## Admin token

Write routes need a bearer token. Terraform generates it as a write-only value, so it is
never stored in state. Read it from Secrets Manager:

```sh
export AWS_PROFILE=celestiea
aws secretsmanager get-secret-value --query SecretString --output text \
  --secret-id celestiea-dev/admin-token
```

The secret is named `celestiea-<env>/admin-token`;
`terraform -chdir=infra/terraform/envs/dev output -raw admin_token_secret_arn` prints its
ARN. If the AWS CLI says `--secret-id` has length 0, the Terraform call inside `$(…)`
failed, usually because `AWS_PROFILE` isn't set. The command prints the token, so keep it
out of recordings and screenshots.

Enter it on `/admin` or send it as `Authorization: Bearer <token>`.

## Cost, teardown and the kill switch

**Tear down with `make destroy ENV=dev`.** Dev is sized for the free tier: about $1.30 a
month on the legacy free tier, about $55 without it. Prod is about $365 a month at idle
([cost](cost.md)).

In dev a $100 monthly budget triggers a kill switch. It throttles the API to zero, stops the
write Lambda, scales the read service and its host to zero and stops the database.
`make resume ENV=dev` starts the database and lets Terraform restore everything else.

## Environments

|          | prod (`envs/prod`)                    | dev (`envs/dev`, free tier)                    |
| -------- | ------------------------------------- | ---------------------------------------------- |
| Database | Aurora writer + reader, RDS Proxy     | one RDS db.t4g.micro, IAM auth from the Lambda |
| Read API | Fargate arm64, 2 to 8 tasks of 1 vCPU | ECS on one t3.micro, host networking           |
| Cache    | Valkey Serverless                     | none                                           |
| Network  | interface endpoints, no internet path | public subnet for the ECS host only            |
| Budget   | alerts                                | alerts and kill switch                         |

Why the two differ, and what that costs in realism, is in
[ADR 0007](adr/0007-terraform-and-repo-separation.md).

## CI

`.github/workflows/ci.yml` needs no AWS access. It lints, type-checks, tests and builds the
app and the images, and runs Terraform fmt, tflint, validate and the module tests.

Deploying from CI would need a GitHub OIDC identity provider and role in the account. This
account's organization policy denies creating OIDC providers, so that part was removed
rather than replaced with long-lived access keys.
