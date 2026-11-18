output "state_bucket" {
  description = "S3 bucket for remote state of the environment roots."
  value       = aws_s3_bucket.state.bucket
}

output "ecr_repository_urls" {
  description = "ECR repository URL per service image."
  value       = { for name, repository in aws_ecr_repository.service : name => repository.repository_url }
}
