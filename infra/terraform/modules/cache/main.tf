# Instantiated only when enable_cache is true. With it off, the read API falls back to
# Postgres for product detail and keeps reference data in memory.
resource "aws_elasticache_serverless_cache" "this" {
  name                 = var.name
  engine               = "valkey"
  major_engine_version = "8"
  subnet_ids           = var.subnet_ids
  security_group_ids   = [var.security_group_id]

  cache_usage_limits {
    data_storage {
      maximum = var.max_storage_gb
      unit    = "GB"
    }
    ecpu_per_second {
      maximum = var.max_ecpu_per_second
    }
  }
}
