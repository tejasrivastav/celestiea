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
  description = "Secret with the catalog_writer password; null when the writer signs in with IAM."
  type        = string
  default     = null
}

variable "launch_type" {
  description = "FARGATE or EC2, matching the cluster's capacity."
  type        = string
  default     = "FARGATE"
}

variable "network_mode" {
  description = "awsvpc on Fargate, host on the free-tier EC2 host."
  type        = string
  default     = "awsvpc"
}

variable "cpu_architecture" {
  description = "ARM64 on Fargate, X86_64 on the t3.micro host."
  type        = string
  default     = "ARM64"
}

variable "memory" {
  description = "Task memory in MiB."
  type        = number
  default     = 512
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}
