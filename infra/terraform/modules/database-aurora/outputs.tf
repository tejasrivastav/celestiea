output "kind" {
  description = "What to stop or alarm on: an Aurora cluster."
  value       = "cluster"
}

output "identifier" {
  description = "Aurora cluster identifier."
  value       = aws_rds_cluster.this.cluster_identifier
}

output "writer_endpoint" {
  description = "Cluster writer endpoint (migrator)."
  value       = aws_rds_cluster.this.endpoint
}

output "reader_endpoint" {
  description = "Cluster reader endpoint (read API)."
  value       = aws_rds_cluster.this.reader_endpoint
}

output "write_endpoint" {
  description = "Endpoint the write Lambda connects to: RDS Proxy."
  value       = aws_db_proxy.this.endpoint
}

output "write_iam_resource_id" {
  description = "Resource ID in the write Lambda's rds-db:connect permission (the proxy)."
  value       = element(split(":", aws_db_proxy.this.arn), 6)
}

output "writer_signs_in_with_iam" {
  description = "False: the proxy signs in to Postgres with the writer's password."
  value       = false
}

output "database_name" {
  description = "Application database name."
  value       = var.database_name
}

output "master_username" {
  description = "Master username."
  value       = var.master_username
}

output "master_secret_arn" {
  description = "Secrets Manager ARN of the RDS-managed master credentials."
  value       = aws_rds_cluster.this.master_user_secret[0].secret_arn
}

output "role_secret_arns" {
  description = "Secrets Manager ARN per application role (catalog_reader, catalog_writer)."
  value       = { for role, secret in aws_secretsmanager_secret.role : role => secret.arn }
}

output "seed_bucket" {
  description = "Bucket the seed CSVs are uploaded to."
  value       = aws_s3_bucket.seed.bucket
}

output "arn" {
  description = "Aurora cluster ARN."
  value       = aws_rds_cluster.this.arn
}
