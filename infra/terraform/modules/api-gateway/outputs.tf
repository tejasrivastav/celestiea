output "api_id" {
  description = "HTTP API ID."
  value       = aws_apigatewayv2_api.this.id
}

output "api_domain" {
  description = "Default execute-api domain, used as the CloudFront origin."
  value       = replace(aws_apigatewayv2_api.this.api_endpoint, "https://", "")
}
