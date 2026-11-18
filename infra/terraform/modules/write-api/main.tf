data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

locals {
  functions = {
    write      = { handler = "lambda.handler", in_vpc = true }
    authorizer = { handler = "authorizer.handler", in_vpc = false }
  }
}

resource "aws_iam_role" "function" {
  for_each           = local.functions
  name               = "${var.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "basic" {
  for_each   = local.functions
  role       = aws_iam_role.function[each.key].name
  policy_arn = each.value.in_vpc ? "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole" : "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# IAM authentication to RDS Proxy as catalog_writer: the function holds no DB password.
resource "aws_iam_role_policy" "write_connect" {
  name = "connect-to-proxy"
  role = aws_iam_role.function["write"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["rds-db:connect"]
      Resource = "arn:aws:rds-db:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:dbuser:${var.proxy_resource_id}/catalog_writer"
    }]
  })
}

# MVP bearer token for write routes. Generated as a write-only value so it is never in
# state; the README explains how an admin reads it from Secrets Manager.
ephemeral "random_password" "auth_token" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "auth_token" {
  name                    = "${var.name}/admin-token"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "auth_token" {
  secret_id                = aws_secretsmanager_secret.auth_token.id
  secret_string_wo         = ephemeral.random_password.auth_token.result
  secret_string_wo_version = var.auth_token_version
}

resource "aws_iam_role_policy" "authorizer_secret" {
  name = "read-auth-token"
  role = aws_iam_role.function["authorizer"].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.auth_token.arn }]
  })
}

resource "aws_cloudwatch_log_group" "function" {
  for_each          = local.functions
  name              = "/aws/lambda/${var.name}-${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "this" {
  for_each         = local.functions
  function_name    = "${var.name}-${each.key}"
  role             = aws_iam_role.function[each.key].arn
  filename         = var.zip_path
  source_code_hash = filebase64sha256(var.zip_path)
  handler          = each.value.handler
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  memory_size      = each.key == "write" ? 512 : 256
  timeout          = each.key == "write" ? 10 : 3
  # Caps concurrent writers, and with them connections through RDS Proxy.
  reserved_concurrent_executions = each.key == "write" ? var.write_concurrency : -1

  dynamic "vpc_config" {
    for_each = each.value.in_vpc ? [1] : []
    content {
      subnet_ids         = var.subnet_ids
      security_group_ids = [var.security_group_id]
    }
  }

  environment {
    variables = each.key == "write" ? {
      DATABASE_HOST = var.proxy_endpoint
      DATABASE_NAME = var.database_name
      DATABASE_USER = "catalog_writer"
      VALKEY_URL    = var.valkey_url
      NODE_OPTIONS  = "--enable-source-maps"
      } : {
      AUTH_TOKEN_SECRET_ARN = aws_secretsmanager_secret.auth_token.arn
      NODE_OPTIONS          = "--enable-source-maps"
    }
  }

  depends_on = [aws_cloudwatch_log_group.function]
}
