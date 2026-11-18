variable "name" {
  description = "Name prefix for the functions."
  type        = string
}

variable "zip_path" {
  description = "Path to the write API Lambda zip (both handlers)."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for the write function."
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group of the write function."
  type        = string
}

variable "database_endpoint" {
  description = "Where the write function connects: RDS Proxy (prod) or the instance (dev)."
  type        = string
}

variable "database_iam_resource_id" {
  description = "Proxy or instance resource ID for the rds-db:connect permission."
  type        = string
}

variable "database_name" {
  description = "Application database name."
  type        = string
}

variable "valkey_url" {
  description = "Valkey URL, or an empty string when the cache is disabled."
  type        = string
}

variable "write_concurrency" {
  description = "Reserved concurrency of the write function."
  type        = number
  default     = 10
}

variable "auth_token_version" {
  description = "Bump to rotate the admin bearer token."
  type        = number
  default     = 1
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}
