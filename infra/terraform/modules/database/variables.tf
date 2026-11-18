variable "name" {
  description = "Name prefix for the cluster, proxy and secrets."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for the cluster and proxy."
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group of the Aurora cluster."
  type        = string
}

variable "proxy_security_group_id" {
  description = "Security group of RDS Proxy."
  type        = string
}

variable "engine_version" {
  description = "Aurora PostgreSQL engine version."
  type        = string
  default     = "16.6"
}

variable "database_name" {
  description = "Name of the application database."
  type        = string
  default     = "celestiea"
}

variable "master_username" {
  description = "Master user; its password is managed by RDS in Secrets Manager."
  type        = string
  default     = "celestiea_admin"
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

variable "deletion_protection" {
  description = "Protect the cluster from deletion."
  type        = bool
  default     = false
}

variable "role_password_version" {
  description = "Bump to generate and store new application role passwords."
  type        = number
  default     = 1
}
