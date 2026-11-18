variable "name" {
  description = "API name."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for the VPC link."
  type        = list(string)
}

variable "vpc_link_security_group_id" {
  description = "Security group of the VPC link."
  type        = string
}

variable "read_api_listener_arn" {
  description = "Internal ALB listener of the read API."
  type        = string
}

variable "write_invoke_arn" {
  description = "Invoke ARN of the write function."
  type        = string
}

variable "authorizer_invoke_arn" {
  description = "Invoke ARN of the authorizer function."
  type        = string
}

variable "function_names" {
  description = "Functions API Gateway may invoke, by role."
  type        = map(string)
}

variable "throttling_burst_limit" {
  description = "Burst limit applied to every route."
  type        = number
  default     = 200
}

variable "throttling_rate_limit" {
  description = "Steady-state requests per second applied to every route."
  type        = number
  default     = 100
}

variable "log_retention_days" {
  description = "Access log retention."
  type        = number
  default     = 14
}
