output "cluster_name" {
  description = "ECS cluster name, shared with the migrator task."
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "ECS service name of the read API."
  value       = aws_ecs_service.read_api.name
}

output "listener_arn" {
  description = "ALB listener the API Gateway VPC link integrates with."
  value       = aws_lb_listener.http.arn
}

output "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metrics."
  value       = aws_lb.this.arn_suffix
}

output "service_arn" {
  description = "ECS service ARN of the read API."
  value       = aws_ecs_service.read_api.id
}
