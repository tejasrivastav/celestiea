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





