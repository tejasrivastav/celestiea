variable "name" {
  description = "Cache name."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for the cache endpoints."
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group of the cache."
  type        = string
}

variable "max_storage_gb" {
  description = "Upper limit on stored data, which caps cost."
  type        = number
  default     = 1
}

variable "max_ecpu_per_second" {
  description = "Upper limit on ElastiCache processing units per second."
  type        = number
  default     = 1000
}
