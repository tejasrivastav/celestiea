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


variable "alert_email" {
  description = "Email for alarms and budget notifications."
  type        = string
}

variable "monthly_budget_usd" {
  description = "Monthly budget; prod only alerts, it is never stopped automatically."
  type        = number
  default     = 1000
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


