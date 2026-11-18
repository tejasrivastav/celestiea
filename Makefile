APP := app
COMPOSE := docker compose --project-directory $(APP)
LOCAL_DATABASE_URL := postgres://celestiea:celestiea@localhost:5432/celestiea

.PHONY: local local-down seed-local test lint

## Start the full local stack on http://localhost:8080
local:
	$(COMPOSE) up -d --build --wait

local-down:
	$(COMPOSE) down

## Load the full seed (about a minute); SCALE=small for ~5k articles
seed-local:
	cd $(APP) && DATABASE_URL=$(LOCAL_DATABASE_URL) pnpm seed --scale=$(or $(SCALE),full)

## Unit and integration tests against the compose Postgres and Valkey
test:
	$(COMPOSE) up -d --wait postgres valkey
	cd $(APP) && pnpm test

lint:
	cd $(APP) && pnpm lint && pnpm typecheck

# --- AWS (eu-central-1, dev) -------------------------------------------------------
# Every target below creates, changes or deletes billable resources.

AWS_REGION ?= eu-central-1
TF_BOOTSTRAP := infra/terraform/bootstrap
TF_DEV := infra/terraform/envs/dev
GIT_SHA := $(shell git rev-parse --short=12 HEAD)
ACCOUNT_ID = $(shell aws sts get-caller-identity --query Account --output text)
REGISTRY = $(ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
TF_VARS = -var read_api_image_tag=$(GIT_SHA) -var migrator_image_tag=$(GIT_SHA) \
	-var write_api_zip_path=$(CURDIR)/app/services/write-api/write-api.zip \
	-var kill_switch_zip_path=$(CURDIR)/app/services/kill-switch/kill-switch.zip \
	-var alert_email=$(ALERT_EMAIL)
tf_dev_output = $(shell terraform -chdir=$(TF_DEV) output -raw $(1))

.PHONY: bootstrap dev-init artifacts plan-dev deploy-dev deploy-ui seed-dev smoke-dev resume-dev destroy-dev

## One-time: state bucket, ECR repositories and GitHub OIDC roles (local state)
bootstrap:
	terraform -chdir=$(TF_BOOTSTRAP) init
	terraform -chdir=$(TF_BOOTSTRAP) apply

dev-init:
	terraform -chdir=$(TF_DEV) init -input=false -backend-config="bucket=celestiea-tfstate-$(ACCOUNT_ID)"

## Build both Lambda zips and push both images, tagged with the git SHA
artifacts:
	cd $(APP) && pnpm install --frozen-lockfile
	cd $(APP) && pnpm --filter @celestiea/write-api package && pnpm --filter @celestiea/kill-switch package
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(REGISTRY)
	for service in read-api migrator; do \
		docker buildx build --platform linux/arm64 --provenance=false \
			-f $(APP)/services/$$service/Dockerfile -t $(REGISTRY)/celestiea/$$service:$(GIT_SHA) --push $(APP) || exit 1; \
	done

plan-dev: dev-init
	terraform -chdir=$(TF_DEV) plan $(TF_VARS)

## Build, apply, migrate, roll the read service, publish the UI, smoke test. Needs ALERT_EMAIL.
deploy-dev: artifacts dev-init
	terraform -chdir=$(TF_DEV) apply $(TF_APPLY_FLAGS) $(TF_VARS)
	scripts/run-migrator-task.sh migrate
	aws ecs update-service --cluster $(call tf_dev_output,ecs_cluster) --service read-api --force-new-deployment >/dev/null
	$(MAKE) deploy-ui smoke-dev

## Hashed assets are immutable; index.html is revalidated, and only it is invalidated.
deploy-ui:
	cd $(APP) && pnpm --filter @celestiea/web build
	aws s3 sync $(APP)/web/dist s3://$(call tf_dev_output,ui_bucket) --delete --exclude index.html \
		--cache-control "public, max-age=31536000, immutable"
	aws s3 cp $(APP)/web/dist/index.html s3://$(call tf_dev_output,ui_bucket)/index.html --cache-control "no-cache"
	aws cloudfront create-invalidation --distribution-id $(call tf_dev_output,distribution_id) --paths /index.html >/dev/null

## Generate the full catalog locally, upload it and import it inside the VPC
seed-dev:
	cd $(APP) && pnpm seed --scale=full --generate-only
	aws s3 cp --recursive --content-encoding gzip $(APP)/packages/seed/data/full s3://$(call tf_dev_output,seed_bucket)/seed/full/
	scripts/run-migrator-task.sh import-seed --bucket $(call tf_dev_output,seed_bucket)

smoke-dev:
	curl -fsS -o /dev/null -w "UI %{http_code}\n" $(call tf_dev_output,url)/
	curl -fsS -G $(call tf_dev_output,url)/v1/graphql --data-urlencode 'query={ brands { slug } }' -o /dev/null -w "GraphQL %{http_code}\n"
	test "$$(curl -s -o /dev/null -w '%{http_code}' -X POST $(call tf_dev_output,url)/v1/products)" = 401 && echo "Writes require a token"

## Undo the kill switch: start Aurora, then let Terraform restore counts and limits
resume-dev: dev-init
	aws rds start-db-cluster --db-cluster-identifier $(call tf_dev_output,db_cluster_id) >/dev/null || true
	terraform -chdir=$(TF_DEV) apply $(TF_APPLY_FLAGS) $(TF_VARS)

## Delete the whole dev environment (bootstrap resources stay)
destroy-dev: dev-init
	terraform -chdir=$(TF_DEV) destroy $(TF_VARS)
