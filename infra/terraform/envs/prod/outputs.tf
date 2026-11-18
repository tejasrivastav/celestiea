output "url" {
  description = "Public URL of the shop (CloudFront)."
  value       = module.edge.url
}

output "ui_bucket" {
  description = "Bucket for the UI build."
  value       = module.edge.ui_bucket
}

output "distribution_id" {
  description = "CloudFront distribution ID."
  value       = module.edge.distribution_id
}

output "seed_bucket" {
  description = "Bucket for seed CSVs."
  value       = module.database.seed_bucket
}

output "ecs_cluster" {
  description = "ECS cluster for read API and migrator tasks."
  value       = module.read_service.cluster_name
}

output "migrator_task_definition" {
  description = "Task definition for aws ecs run-task."
  value       = module.migrator.task_definition_arn
}

output "migrator_launch" {
  description = "How to run migrator tasks: launch type, and subnets and security groups for awsvpc."
  value = {
    launch_type     = module.read_service.launch_type
    network_mode    = module.read_service.network_mode
    subnets         = module.network.private_subnet_ids
    security_groups = [module.network.security_group_ids["migrator"]]
  }
}

output "database" {
  description = "Database kind (cluster or instance) and identifier, for resume-dev."
  value       = { kind = module.database.kind, identifier = module.database.identifier }
}

output "admin_token_secret_arn" {
  description = "Secret holding the admin bearer token for write routes."
  value       = module.write_api.auth_token_secret_arn
}
