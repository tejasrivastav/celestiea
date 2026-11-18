variable "name" {
  description = "Name prefix; also the ECS cluster name."
  type        = string
}

variable "image" {
  description = "Read API image URI including tag."
  type        = string
}

variable "vpc_id" {
  description = "VPC for the target group."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for tasks and the internal ALB."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group of the internal ALB."
  type        = string
}

variable "service_security_group_id" {
  description = "Security group of the read API tasks."
  type        = string
}

variable "database_host" {
  description = "Aurora reader endpoint."
  type        = string
}

variable "database_name" {
  description = "Application database name."
  type        = string
}

variable "database_secret_arn" {
  description = "Secret holding the catalog_reader password."
  type        = string
}

variable "valkey_url" {
  description = "Valkey URL, or an empty string when the cache is disabled."
  type        = string
}

variable "cpu" {
  description = "Task CPU units."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Task memory in MiB."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Minimum and initial number of tasks."
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Maximum number of tasks under CPU autoscaling."
  type        = number
  default     = 3
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}
