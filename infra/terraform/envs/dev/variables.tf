variable "region" {
  description = "AWS region."
  type        = string
  default     = "eu-central-1"
}

variable "read_api_image_tag" {
  description = "Tag of the read API image in ECR (the git SHA, set by the deploy workflow)."
  type        = string
}

variable "migrator_image_tag" {
  description = "Tag of the migrator image in ECR."
  type        = string
}

variable "write_api_zip_path" {
  description = "Path to the built write API Lambda zip."
  type        = string
}

variable "kill_switch_zip_path" {
  description = "Path to the built kill switch Lambda zip."
  type        = string
}

variable "alert_email" {
  description = "Email for alarms and budget notifications."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly budget; at 100% the kill switch stops the environment."
  type        = number
  default     = 100
}

variable "enable_cache" {
  description = "Create ElastiCache Serverless Valkey. Off: reads go to Postgres."
  type        = bool
  default     = true
}

variable "min_acu" {
  description = "Minimum Aurora capacity units per instance."
  type        = number
  default     = 0.5
}

variable "max_acu" {
  description = "Maximum Aurora capacity units per instance."
  type        = number
  default     = 4
}

variable "read_desired_count" {
  description = "Minimum number of read API tasks."
  type        = number
  default     = 1
}

variable "read_max_count" {
  description = "Maximum number of read API tasks."
  type        = number
  default     = 3
}
