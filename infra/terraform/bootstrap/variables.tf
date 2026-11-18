variable "region" {
  description = "AWS region for the state bucket and ECR repositories."
  type        = string
  default     = "eu-north-1"
}

variable "github_repository" {
  description = "GitHub repository (owner/name) allowed to assume the CI roles."
  type        = string
  default     = "tejasrivastav/celestiea"
}
