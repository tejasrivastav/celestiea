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

module "network" {
  source = "../../modules/network"
  name   = local.name
}

module "database" {
  source                  = "../../modules/database"
  name                    = local.name
  subnet_ids              = module.network.private_subnet_ids
  security_group_id       = module.network.security_group_ids["database"]
  proxy_security_group_id = module.network.security_group_ids["database_proxy"]
  min_acu                 = var.min_acu
  max_acu                 = var.max_acu
}

module "cache" {
  source            = "../../modules/cache"
  count             = var.enable_cache ? 1 : 0
  name              = local.name
  subnet_ids        = module.network.private_subnet_ids
  security_group_id = module.network.security_group_ids["cache"]
}

locals {
  valkey_url = var.enable_cache ? module.cache[0].url : ""
}

module "read_service" {
  source                    = "../../modules/read-service"
  name                      = local.name
  image                     = "${data.aws_ecr_repository.service["read-api"].repository_url}:${var.read_api_image_tag}"
  vpc_id                    = module.network.vpc_id
  subnet_ids                = module.network.private_subnet_ids
  alb_security_group_id     = module.network.security_group_ids["alb"]
  service_security_group_id = module.network.security_group_ids["read_service"]
  database_host             = module.database.reader_endpoint
  database_name             = module.database.database_name
  database_secret_arn       = module.database.role_secret_arns["catalog_reader"]
  valkey_url                = local.valkey_url
  desired_count             = var.read_desired_count
  max_count                 = var.read_max_count
}

module "migrator" {
  source            = "../../modules/migrator"
  name              = local.name
  image             = "${data.aws_ecr_repository.service["migrator"].repository_url}:${var.migrator_image_tag}"
  database_host     = module.database.writer_endpoint
  database_name     = module.database.database_name
  master_username   = module.database.master_username
  master_secret_arn = module.database.master_secret_arn
  reader_secret_arn = module.database.role_secret_arns["catalog_reader"]
  writer_secret_arn = module.database.role_secret_arns["catalog_writer"]
}

module "write_api" {
  source            = "../../modules/write-api"
  name              = local.name
  zip_path          = var.write_api_zip_path
  subnet_ids        = module.network.private_subnet_ids
  security_group_id = module.network.security_group_ids["write_lambda"]
  proxy_endpoint    = module.database.proxy_endpoint
  proxy_resource_id = module.database.proxy_resource_id
  database_name     = module.database.database_name
  valkey_url        = local.valkey_url
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
  source               = "../../modules/observability"
  name                 = local.name
  alert_email          = var.alert_email
  monthly_budget_usd   = var.monthly_budget_usd
  kill_switch_zip_path = var.kill_switch_zip_path
  http_api_id          = module.api_gateway.api_id
  write_function_name  = module.write_api.write_function_name
  write_function_arn   = module.write_api.write_function_arn
  ecs_cluster_name     = module.read_service.cluster_name
  ecs_service_name     = module.read_service.service_name
  ecs_service_arn      = module.read_service.service_arn
  alb_arn_suffix       = module.read_service.alb_arn_suffix
  db_cluster_id        = module.database.cluster_id
  db_cluster_arn       = module.database.cluster_arn
  max_acu              = var.max_acu
  distribution_id      = module.edge.distribution_id
}
