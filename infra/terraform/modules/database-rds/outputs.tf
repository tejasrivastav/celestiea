output "kind" {
  description = "What to stop or alarm on: a single RDS instance."
  value       = "instance"
}

output "identifier" {
  description = "RDS instance identifier."
  value       = aws_db_instance.this.identifier
}

output "arn" {
  description = "RDS instance ARN."
  value       = aws_db_instance.this.arn
}

output "writer_endpoint" {
  description = "Instance address (migrator)."
  value       = aws_db_instance.this.address
}

output "reader_endpoint" {
  description = "Instance address; there is no separate replica."
  value       = aws_db_instance.this.address
}

output "write_endpoint" {
  description = "Endpoint the write Lambda connects to: the instance itself."
  value       = aws_db_instance.this.address
}

output "write_iam_resource_id" {
  description = "Resource ID in the write Lambda's rds-db:connect permission (the instance)."
  value       = aws_db_instance.this.resource_id
}

output "writer_signs_in_with_iam" {
  description = "True: catalog_writer gets rds_iam instead of a password."
  value       = true
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
  value       = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "role_secret_arns" {
  description = "Secrets Manager ARN per password-based application role."
  value       = { catalog_reader = aws_secretsmanager_secret.reader.arn }
}

output "seed_bucket" {
  description = "Bucket the seed CSVs are uploaded to."
  value       = aws_s3_bucket.seed.bucket
}
