variable "name" {
  description = "Name prefix for the bucket and distribution."
  type        = string
}

variable "api_domain" {
  description = "API Gateway execute-api domain for the /v1/* origin."
  type        = string
}
