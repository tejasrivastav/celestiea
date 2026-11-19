terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "celestiea", Environment = "dev", ManagedBy = "terraform" }
  }
}

locals {
  name = "celestiea-dev"
}

data "aws_ecr_repository" "service" {
  for_each = toset(["read-api", "migrator"])
  name     = "celestiea/${each.key}"
}

# Free-tier sized: one db.t4g.micro without replica or proxy, one t3.micro ECS host, no
# cache and no interface endpoints. Same modules and application as prod; the
# differences and their costs are listed in docs/cost.md.
module "network" {
  source                     = "../../modules/network"
  name                       = local.name
  enable_interface_endpoints = false
  enable_public_subnets      = true
  database_proxy             = false
}

module "database" {
  source            = "../../modules/database-rds"
  name              = local.name
  subnet_ids        = module.network.private_subnet_ids
  security_group_id = module.network.security_group_ids["database"]
}

module "read_service" {
  source                    = "../../modules/read-service"
  name                      = local.name
  capacity                  = "ec2"
  host_subnet_ids           = module.network.public_subnet_ids
  image                     = "${data.aws_ecr_repository.service["read-api"].repository_url}:${var.read_api_image_tag}"
  vpc_id                    = module.network.vpc_id
  subnet_ids                = module.network.private_subnet_ids
  alb_security_group_id     = module.network.security_group_ids["alb"]
  service_security_group_id = module.network.security_group_ids["read_service"]
  database_host             = module.database.reader_endpoint
  database_name             = module.database.database_name
  database_secret_arn       = module.database.role_secret_arns["catalog_reader"]
  valkey_url                = ""
  cpu                       = 256
  memory                    = 384
  desired_count             = 1
  max_count                 = 1
}

# Shares the t3.micro host with the read API, hence host networking and the small size.
module "migrator" {
  source            = "../../modules/migrator"
  name              = local.name
  image             = "${data.aws_ecr_repository.service["migrator"].repository_url}:${var.migrator_image_tag}"
  launch_type       = "EC2"
  network_mode      = "host"
  cpu_architecture  = "X86_64"
  memory            = 448
  database_host     = module.database.writer_endpoint
  database_name     = module.database.database_name
  master_username   = module.database.master_username
  master_secret_arn = module.database.master_secret_arn
  reader_secret_arn = module.database.role_secret_arns["catalog_reader"]
}

module "write_api" {
  source                   = "../../modules/write-api"
  name                     = local.name
  zip_path                 = var.write_api_zip_path
  subnet_ids               = module.network.private_subnet_ids
  security_group_id        = module.network.security_group_ids["write_lambda"]
  database_endpoint        = module.database.write_endpoint
  database_iam_resource_id = module.database.write_iam_resource_id
  database_name            = module.database.database_name
  valkey_url               = ""
  # Without RDS Proxy each Lambda instance holds its own connections. New accounts have a
  # total Lambda concurrency of 10 and AWS keeps all 10 unreserved, so no reservation is
  # possible; that account limit already caps writers far below db.t4g.micro's ~80
  # connections. Request a quota increase before relying on more.
  write_concurrency = -1
}

module "api_gateway" {
  source                     = "../../modules/api-gateway"
  name                       = local.name
  subnet_ids                 = module.network.private_subnet_ids
  vpc_link_security_group_id = module.network.security_group_ids["vpc_link"]
  read_api_listener_arn      = module.read_service.listener_arn
  write_invoke_arn           = module.write_api.write_invoke_arn
  authorizer_invoke_arn      = module.write_api.authorizer_invoke_arn
  function_names             = module.write_api.function_names
}

module "edge" {
  source     = "../../modules/edge"
  name       = local.name
  api_domain = module.api_gateway.api_domain
}

module "observability" {
  source                     = "../../modules/observability"
  name                       = local.name
  alert_email                = var.alert_email
  monthly_budget_usd         = var.monthly_budget_usd
  http_api_id                = module.api_gateway.api_id
  write_function_name        = module.write_api.write_function_name
  write_function_arn         = module.write_api.write_function_arn
  ecs_cluster_name           = module.read_service.cluster_name
  ecs_service_name           = module.read_service.service_name
  ecs_service_arn            = module.read_service.service_arn
  alb_arn_suffix             = module.read_service.alb_arn_suffix
  db_kind                    = module.database.kind
  db_identifier              = module.database.identifier
  db_arn                     = module.database.arn
  distribution_id            = module.edge.distribution_id
  enable_kill_switch         = true
  kill_switch_zip_path       = var.kill_switch_zip_path
  ecs_host_autoscaling_group = module.read_service.host_autoscaling_group
}
