output "url" {
  description = "TLS connection URL for Valkey clients."
  value       = "rediss://${aws_elasticache_serverless_cache.this.endpoint[0].address}:${aws_elasticache_serverless_cache.this.endpoint[0].port}"
}
