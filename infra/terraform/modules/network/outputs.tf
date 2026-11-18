output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs, one per availability zone."
  value       = [for subnet in aws_subnet.private : subnet.id]
}

output "security_group_ids" {
  description = "Security group ID by role (alb, read_service, write_lambda, database, ...)."
  value       = { for role, group in aws_security_group.this : role => group.id }
}
