variable "name" {
  description = "Name prefix for the instance and secrets."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for the instance."
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group of the instance."
  type        = string
}

variable "engine_version" {
  description = "PostgreSQL major version; RDS picks the current minor and upgrades it."
  type        = string
  default     = "16"
}

variable "instance_class" {
  description = "Instance class; db.t4g.micro is free-tier eligible."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage_gb" {
  description = "Storage in GiB; 20 is the free-tier allowance."
  type        = number
  default     = 20
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

variable "deletion_protection" {
  description = "Protect the instance from deletion."
  type        = bool
  default     = false
}

variable "role_password_version" {
  description = "Bump to generate and store a new catalog_reader password."
  type        = number
  default     = 1
}
