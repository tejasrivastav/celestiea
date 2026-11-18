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

output "migrator_network" {
  description = "Subnets and security group for migrator tasks."
  value = {
    subnets         = module.network.private_subnet_ids
    security_groups = [module.network.security_group_ids["migrator"]]
  }
}

output "db_cluster_id" {
  description = "Aurora cluster identifier."
  value       = module.database.cluster_id
}

output "admin_token_secret_arn" {
  description = "Secret holding the admin bearer token for write routes."
  value       = module.write_api.auth_token_secret_arn
}
