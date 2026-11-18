variable "name" {
  description = "Name prefix."
  type        = string
}

variable "image" {
  description = "Migrator image URI including tag."
  type        = string
}

variable "database_host" {
  description = "Aurora writer endpoint."
  type        = string
}

variable "database_name" {
  description = "Application database name."
  type        = string
}

variable "master_username" {
  description = "Master username; migrations and the seed import run as the master user."
  type        = string
}

variable "master_secret_arn" {
  description = "RDS-managed secret with the master password."
  type        = string
}

variable "reader_secret_arn" {
  description = "Secret with the catalog_reader password."
  type        = string
}

variable "writer_secret_arn" {
  description = "Secret with the catalog_writer password."
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}
