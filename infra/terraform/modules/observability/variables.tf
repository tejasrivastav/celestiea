variable "name" {
  description = "Name prefix."
  type        = string
}

variable "alert_email" {
  description = "Email address for alarms and budget notifications (confirm the SNS subscription)."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly cost budget; reaching it triggers the kill switch."
  type        = number
}

variable "kill_switch_zip_path" {
  description = "Path to the kill switch Lambda zip."
  type        = string
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

variable "db_cluster_id" {
  description = "Aurora cluster identifier (the proxy shares the name)."
  type        = string
}

variable "db_cluster_arn" {
  description = "Aurora cluster ARN."
  type        = string
}

variable "max_acu" {
  description = "Configured maximum ACU, for the capacity alarm."
  type        = number
}

variable "distribution_id" {
  description = "CloudFront distribution ID."
  type        = string
}
