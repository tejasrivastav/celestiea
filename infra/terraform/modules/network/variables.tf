variable "name" {
  description = "Name prefix for network resources."
  type        = string
}

variable "cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.40.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones to spread subnets across."
  type        = number
  default     = 2
}

variable "enable_interface_endpoints" {
  description = "Create ECR, Logs and Secrets Manager interface endpoints (needed when nothing has internet access)."
  type        = bool
  default     = true
}

variable "enable_public_subnets" {
  description = "Create public subnets with an internet gateway, for a free-tier ECS host."
  type        = bool
  default     = false
}

variable "database_proxy" {
  description = "Whether the write path goes through RDS Proxy; decides the database security group rules."
  type        = bool
  default     = true
}
