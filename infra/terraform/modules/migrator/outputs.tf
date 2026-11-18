output "task_definition_arn" {
  description = "Task definition to pass to aws ecs run-task."
  value       = aws_ecs_task_definition.migrator.arn
}
