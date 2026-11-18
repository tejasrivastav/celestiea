# Single-instance RDS PostgreSQL for environments that must stay within the free tier.
# It has the same outputs as database-aurora; the differences are no reader replica (the
# reader endpoint is the instance) and no proxy (the write Lambda signs in with IAM
# directly, with its concurrency capped to protect the connection limit).
resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_db_parameter_group" "this" {
  name   = var.name
  family = "postgres${split(".", var.engine_version)[0]}"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
}

resource "aws_db_instance" "this" {
  identifier                          = var.name
  engine                              = "postgres"
  engine_version                      = var.engine_version
  instance_class                      = var.instance_class
  allocated_storage                   = var.allocated_storage_gb
  storage_type                        = "gp2"
  storage_encrypted                   = true
  db_name                             = var.database_name
  username                            = var.master_username
  manage_master_user_password         = true
  iam_database_authentication_enabled = true
  db_subnet_group_name                = aws_db_subnet_group.this.name
  parameter_group_name                = aws_db_parameter_group.this.name
  vpc_security_group_ids              = [var.security_group_id]
  publicly_accessible                 = false
  multi_az                            = false
  backup_retention_period             = 1
  skip_final_snapshot                 = true
  deletion_protection                 = var.deletion_protection
  apply_immediately                   = true
}

ephemeral "random_password" "reader" {
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "reader" {
  name                    = "${var.name}/catalog_reader"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "reader" {
  secret_id = aws_secretsmanager_secret.reader.id
  secret_string_wo = jsonencode({
    username = "catalog_reader"
    password = ephemeral.random_password.reader.result
  })
  secret_string_wo_version = var.role_password_version
}

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

data "aws_iam_policy_document" "rds_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
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

resource "aws_db_instance_role_association" "s3_import" {
  db_instance_identifier = aws_db_instance.this.identifier
  feature_name           = "s3Import"
  role_arn               = aws_iam_role.s3_import.arn
}
