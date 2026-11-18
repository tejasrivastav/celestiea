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

# --- AWS (eu-central-1) --------------------------------------------------------------
# Every target below creates, changes or deletes billable resources. ENV=dev (default,
# free-tier sized) or ENV=prod.

ENV ?= dev
AWS_REGION ?= eu-central-1
TF_BOOTSTRAP := infra/terraform/bootstrap
TF_ENV := infra/terraform/envs/$(ENV)
GIT_SHA := $(shell git rev-parse --short=12 HEAD)
ACCOUNT_ID = $(shell aws sts get-caller-identity --query Account --output text)
REGISTRY = $(ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com
TF_VARS = -var read_api_image_tag=$(GIT_SHA) -var migrator_image_tag=$(GIT_SHA) \
	-var write_api_zip_path=$(CURDIR)/app/services/write-api/write-api.zip \
	-var alert_email=$(ALERT_EMAIL) \
	$(if $(filter dev,$(ENV)),-var kill_switch_zip_path=$(CURDIR)/app/services/kill-switch/kill-switch.zip)
tf_output = $(shell terraform -chdir=$(TF_ENV) output -raw $(1))
tf_output_json = $(shell terraform -chdir=$(TF_ENV) output -json $(1) | jq -r '$(2)')

.PHONY: bootstrap tf-init artifacts plan deploy deploy-ui seed smoke resume destroy

## One-time: state bucket, ECR repositories and GitHub OIDC roles (local state)
bootstrap:
	terraform -chdir=$(TF_BOOTSTRAP) init
	terraform -chdir=$(TF_BOOTSTRAP) apply

tf-init:
	terraform -chdir=$(TF_ENV) init -input=false -backend-config="bucket=celestiea-tfstate-$(ACCOUNT_ID)"

## Lambda zips, and images for both architectures (prod Fargate is arm64, the dev host x86)
artifacts:
	cd $(APP) && pnpm install --frozen-lockfile
	cd $(APP) && pnpm --filter @celestiea/write-api package && pnpm --filter @celestiea/kill-switch package
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(REGISTRY)
	for service in read-api migrator; do \
		docker buildx build --platform linux/arm64,linux/amd64 --provenance=false \
			-f $(APP)/services/$$service/Dockerfile -t $(REGISTRY)/celestiea/$$service:$(GIT_SHA) --push $(APP) || exit 1; \
	done

plan: tf-init
	terraform -chdir=$(TF_ENV) plan $(TF_VARS)

## Build, apply, migrate, roll the read service, publish the UI, smoke test. Needs ALERT_EMAIL.
deploy: artifacts tf-init
	terraform -chdir=$(TF_ENV) apply $(TF_APPLY_FLAGS) $(TF_VARS)
	ENV=$(ENV) scripts/run-migrator-task.sh migrate
	aws ecs update-service --cluster $(call tf_output,ecs_cluster) --service read-api --force-new-deployment >/dev/null
	$(MAKE) deploy-ui smoke ENV=$(ENV)

## Hashed assets are immutable; index.html is revalidated, and only it is invalidated.
deploy-ui:
	cd $(APP) && pnpm --filter @celestiea/web build
	aws s3 sync $(APP)/web/dist s3://$(call tf_output,ui_bucket) --delete --exclude index.html \
		--cache-control "public, max-age=31536000, immutable"
	aws s3 cp $(APP)/web/dist/index.html s3://$(call tf_output,ui_bucket)/index.html --cache-control "no-cache"
	aws cloudfront create-invalidation --distribution-id $(call tf_output,distribution_id) --paths /index.html >/dev/null

## Generate the full catalog locally, upload it and import it inside the VPC
seed:
	cd $(APP) && pnpm seed --scale=full --generate-only
	aws s3 cp --recursive --content-encoding gzip $(APP)/packages/seed/data/full s3://$(call tf_output,seed_bucket)/seed/full/
	ENV=$(ENV) scripts/run-migrator-task.sh import-seed --bucket $(call tf_output,seed_bucket)

smoke:
	curl -fsS -o /dev/null -w "UI %{http_code}\n" $(call tf_output,url)/
	curl -fsS -G $(call tf_output,url)/v1/graphql --data-urlencode 'query={ brands { slug } }' -o /dev/null -w "GraphQL %{http_code}\n"
	test "$$(curl -s -o /dev/null -w '%{http_code}' -X POST $(call tf_output,url)/v1/products)" = 401 && echo "Writes require a token"

## Undo the dev kill switch: start the database, then let Terraform restore everything else
resume: tf-init
	if [ "$(call tf_output_json,database,.kind)" = cluster ]; then \
		aws rds start-db-cluster --db-cluster-identifier $(call tf_output_json,database,.identifier); \
	else \
		aws rds start-db-instance --db-instance-identifier $(call tf_output_json,database,.identifier); \
	fi >/dev/null || true
	terraform -chdir=$(TF_ENV) apply $(TF_VARS)

## Delete the environment (bootstrap resources stay). Prod refuses while deletion protection is on.
destroy: tf-init
	terraform -chdir=$(TF_ENV) destroy $(TF_VARS)
