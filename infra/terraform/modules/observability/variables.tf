variable "name" {
  description = "Name prefix."
  type        = string
}

variable "alert_email" {
  description = "Email address for alarms and budget notifications (confirm the SNS subscription)."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget."
  type        = number
}

variable "kill_switch_zip_path" {
  description = "Path to the kill switch Lambda zip; required when enable_kill_switch is true."
  type        = string
  default     = null
}

variable "http_api_id" {
  description = "HTTP API ID."
  type        = string
}

variable "write_function_name" {
  description = "Write Lambda function name."
  type        = string
}

variable "write_function_arn" {
  description = "Write Lambda function ARN."
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS cluster of the read API."
  type        = string
}

variable "ecs_service_name" {
  description = "ECS service of the read API."
  type        = string
}

variable "ecs_service_arn" {
  description = "ECS service ARN of the read API."
  type        = string
}

variable "alb_arn_suffix" {
  description = "Internal ALB ARN suffix."
  type        = string
}

variable "db_kind" {
  description = "\"cluster\" (Aurora) or \"instance\" (RDS)."
  type        = string
}

variable "db_identifier" {
  description = "Cluster or instance identifier (an Aurora proxy shares the name)."
  type        = string
}

variable "db_arn" {
  description = "Cluster or instance ARN."
  type        = string
}

variable "max_acu" {
  description = "Configured maximum ACU, for the Aurora capacity alarm."
  type        = number
  default     = 0
}

variable "enable_kill_switch" {
  description = "Stop the environment when the budget is reached (dev only)."
  type        = bool
  default     = false
}

variable "ecs_host_autoscaling_group" {
  description = "Auto Scaling group of the ECS host to stop, or null on Fargate."
  type        = string
  default     = null
}

variable "distribution_id" {
  description = "CloudFront distribution ID."
  type        = string
}
