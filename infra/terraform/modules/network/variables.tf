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
