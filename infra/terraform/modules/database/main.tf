resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_rds_cluster_parameter_group" "this" {
  name   = var.name
  family = "aurora-postgresql${split(".", var.engine_version)[0]}"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_rds_cluster" "this" {
  cluster_identifier              = var.name
  engine                          = "aurora-postgresql"
  engine_mode                     = "provisioned"
  engine_version                  = var.engine_version
  database_name                   = var.database_name
  master_username                 = var.master_username
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.this.name
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.this.name
  vpc_security_group_ids          = [var.security_group_id]
  storage_encrypted               = true
  backup_retention_period         = 1
  skip_final_snapshot             = true
  deletion_protection             = var.deletion_protection

  # Scale to zero is not used: the read API's pool, the ALB readiness checks and RDS Proxy
  # keep connections open, which would keep the cluster awake anyway.
  serverlessv2_scaling_configuration {
    min_capacity = var.min_acu
    max_capacity = var.max_acu
  }
}

# The first instance becomes the writer; the reader endpoint routes to the other one.
resource "aws_rds_cluster_instance" "this" {
  for_each             = { writer = 0, reader = 1 }
  identifier           = "${var.name}-${each.key}"
  cluster_identifier   = aws_rds_cluster.this.id
  instance_class       = "db.serverless"
  engine               = aws_rds_cluster.this.engine
  engine_version       = aws_rds_cluster.this.engine_version
  promotion_tier       = each.value
  publicly_accessible  = false
  db_subnet_group_name = aws_db_subnet_group.this.name
}

# Application role passwords are generated and written straight into Secrets Manager as
# write-only values, so they never appear in Terraform state. The migrator sets them on
# the database roles; the read API and RDS Proxy read them from the secrets.
ephemeral "random_password" "role" {
  for_each = toset(["catalog_reader", "catalog_writer"])
  length   = 40
  special  = false
}

resource "aws_secretsmanager_secret" "role" {
  for_each                = toset(["catalog_reader", "catalog_writer"])
  name                    = "${var.name}/${each.key}"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "role" {
  for_each  = aws_secretsmanager_secret.role
  secret_id = each.value.id
  secret_string_wo = jsonencode({
    username = each.key
    password = ephemeral.random_password.role[each.key].result
  })
  secret_string_wo_version = var.role_password_version
}

data "aws_iam_policy_document" "rds_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "proxy" {
  name               = "${var.name}-proxy"
  assume_role_policy = data.aws_iam_policy_document.rds_assume.json
}

resource "aws_iam_role_policy" "proxy_secret" {
  name = "read-writer-secret"
  role = aws_iam_role.proxy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = aws_secretsmanager_secret.role["catalog_writer"].arn
    }]
  })
}

# Lambda instances come and go with load; the proxy pools their connections so a burst
# of writes cannot exhaust Postgres connections. Clients authenticate with IAM tokens.
resource "aws_db_proxy" "this" {
  name                   = var.name
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.proxy.arn
  vpc_subnet_ids         = var.subnet_ids
  vpc_security_group_ids = [var.proxy_security_group_id]
  require_tls            = true

  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "REQUIRED"
    secret_arn  = aws_secretsmanager_secret.role["catalog_writer"].arn
  }
}

resource "aws_db_proxy_default_target_group" "this" {
  db_proxy_name = aws_db_proxy.this.name

  connection_pool_config {
    max_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "cluster" {
  db_proxy_name         = aws_db_proxy.this.name
  target_group_name     = aws_db_proxy_default_target_group.this.name
  db_cluster_identifier = aws_rds_cluster.this.cluster_identifier
}

# Seed CSVs are uploaded here and imported by Aurora itself (aws_s3.table_import_from_s3).
resource "aws_s3_bucket" "seed" {
  bucket_prefix = "${var.name}-seed-"
  force_destroy = true
}

resource "aws_s3_bucket_public_access_block" "seed" {
  bucket                  = aws_s3_bucket.seed.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "seed" {
  bucket = aws_s3_bucket.seed.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_iam_role" "s3_import" {
  name               = "${var.name}-s3-import"
  assume_role_policy = data.aws_iam_policy_document.rds_assume.json
}

resource "aws_iam_role_policy" "s3_import" {
  name = "read-seed-bucket"
  role = aws_iam_role.s3_import.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.seed.arn}/*" },
      { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.seed.arn },
    ]
  })
}

resource "aws_rds_cluster_role_association" "s3_import" {
  db_cluster_identifier = aws_rds_cluster.this.id
  feature_name          = "s3Import"
  role_arn              = aws_iam_role.s3_import.arn
}
