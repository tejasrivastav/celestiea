data "aws_region" "current" {}

resource "aws_sns_topic" "alerts" {
  name = "${var.name}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Budget enforcement: email at 50% and 80% of actual spend; at 100% the kill switch stops
# the running resources. Billing data lags by hours, so spend can pass the limit before
# the switch fires.
resource "aws_sns_topic" "budget_exceeded" {
  name = "${var.name}-budget-exceeded"
}

data "aws_iam_policy_document" "budget_exceeded" {
  statement {
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.budget_exceeded.arn]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
  }
}

resource "aws_sns_topic_policy" "budget_exceeded" {
  arn    = aws_sns_topic.budget_exceeded.arn
  policy = data.aws_iam_policy_document.budget_exceeded.json
}

resource "aws_budgets_budget" "monthly" {
  name         = "${var.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "notification" {
    for_each = toset([50, 80])
    content {
      comparison_operator        = "GREATER_THAN"
      notification_type          = "ACTUAL"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      subscriber_email_addresses = [var.alert_email]
    }
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    notification_type          = "ACTUAL"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
    subscriber_sns_topic_arns  = [aws_sns_topic.budget_exceeded.arn]
  }
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "kill_switch" {
  name               = "${var.name}-kill-switch"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "kill_switch_logs" {
  role       = aws_iam_role.kill_switch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "kill_switch" {
  name = "stop-spend"
  role = aws_iam_role.kill_switch.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["apigateway:PATCH"], Resource = "arn:aws:apigateway:${data.aws_region.current.region}::/apis/${var.http_api_id}/stages/*" },
      { Effect = "Allow", Action = ["lambda:PutFunctionConcurrency"], Resource = var.write_function_arn },
      { Effect = "Allow", Action = ["ecs:UpdateService"], Resource = var.ecs_service_arn },
      { Effect = "Allow", Action = ["application-autoscaling:RegisterScalableTarget"], Resource = "*" },
      { Effect = "Allow", Action = ["rds:StopDBCluster"], Resource = var.db_cluster_arn },
    ]
  })
}

resource "aws_cloudwatch_log_group" "kill_switch" {
  name              = "/aws/lambda/${var.name}-kill-switch"
  retention_in_days = 14
}

resource "aws_lambda_function" "kill_switch" {
  function_name    = "${var.name}-kill-switch"
  role             = aws_iam_role.kill_switch.arn
  filename         = var.kill_switch_zip_path
  source_code_hash = filebase64sha256(var.kill_switch_zip_path)
  handler          = "handler.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  timeout          = 30

  environment {
    variables = {
      HTTP_API_ID         = var.http_api_id
      WRITE_FUNCTION_NAME = var.write_function_name
      ECS_CLUSTER         = var.ecs_cluster_name
      ECS_SERVICE         = var.ecs_service_name
      DB_CLUSTER_ID       = var.db_cluster_id
    }
  }

  depends_on = [aws_cloudwatch_log_group.kill_switch]
}

resource "aws_sns_topic_subscription" "kill_switch" {
  topic_arn = aws_sns_topic.budget_exceeded.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.kill_switch.arn
}

resource "aws_lambda_permission" "kill_switch_sns" {
  statement_id  = "allow-budget-topic"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kill_switch.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.budget_exceeded.arn
}

# A stopped Aurora cluster starts itself after seven days. RDS-EVENT-0153 marks exactly
# that restart; manual starts emit a different event and are left alone.
resource "aws_cloudwatch_event_rule" "aurora_auto_start" {
  name = "${var.name}-aurora-auto-start"
  event_pattern = jsonencode({
    source      = ["aws.rds"]
    detail-type = ["RDS DB Cluster Event"]
    detail      = { EventID = ["RDS-EVENT-0153"], SourceIdentifier = [var.db_cluster_id] }
  })
}

resource "aws_cloudwatch_event_target" "aurora_auto_start" {
  rule = aws_cloudwatch_event_rule.aurora_auto_start.name
  arn  = aws_lambda_function.kill_switch.arn
}

resource "aws_lambda_permission" "kill_switch_events" {
  statement_id  = "allow-aurora-auto-start-rule"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kill_switch.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.aurora_auto_start.arn
}

locals {
  alarms = {
    api_5xx = {
      namespace   = "AWS/ApiGateway", metric = "5xx", statistic = "Sum", threshold = 10
      dimensions  = { ApiId = var.http_api_id }
      description = "More than 10 API 5xx responses in 5 minutes"
    }
    write_errors = {
      namespace   = "AWS/Lambda", metric = "Errors", statistic = "Sum", threshold = 5
      dimensions  = { FunctionName = var.write_function_name }
      description = "Write Lambda errors"
    }
    replica_lag = {
      namespace   = "AWS/RDS", metric = "AuroraReplicaLagMaximum", statistic = "Maximum", threshold = 1000
      dimensions  = { DBClusterIdentifier = var.db_cluster_id }
      description = "Reader lags the writer by more than a second"
    }
    acu_at_max = {
      namespace   = "AWS/RDS", metric = "ServerlessDatabaseCapacity", statistic = "Maximum", threshold = var.max_acu
      dimensions  = { DBClusterIdentifier = var.db_cluster_id }
      description = "Aurora is at its maximum capacity"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${var.name}-${replace(each.key, "_", "-")}"
  alarm_description   = each.value.description
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.statistic
  dimensions          = each.value.dimensions
  period              = 300
  evaluation_periods  = 1
  threshold           = each.value.threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = var.name
  dashboard_body = jsonencode({
    widgets = [for index, widget in [
      { title = "API latency p95 (ms)", metrics = [["AWS/ApiGateway", "Latency", "ApiId", var.http_api_id, { stat = "p95" }]] },
      { title = "API 4xx / 5xx", metrics = [["AWS/ApiGateway", "4xx", "ApiId", var.http_api_id, { stat = "Sum" }], [".", "5xx", ".", ".", { stat = "Sum" }]] },
      { title = "Read API CPU / memory (%)", metrics = [["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_service_name], [".", "MemoryUtilization", ".", ".", ".", "."]] },
      { title = "ALB target response time p95 (s)", metrics = [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", var.alb_arn_suffix, { stat = "p95" }]] },
      { title = "Write Lambda", metrics = [["AWS/Lambda", "Duration", "FunctionName", var.write_function_name, { stat = "p95" }], [".", "Errors", ".", ".", { stat = "Sum" }], [".", "Throttles", ".", ".", { stat = "Sum" }], [".", "ConcurrentExecutions", ".", ".", { stat = "Maximum" }]] },
      { title = "Aurora ACU / replica lag (ms)", metrics = [["AWS/RDS", "ServerlessDatabaseCapacity", "DBClusterIdentifier", var.db_cluster_id], [".", "AuroraReplicaLagMaximum", ".", "."]] },
      { title = "RDS Proxy connections", metrics = [["AWS/RDS", "DatabaseConnections", "ProxyName", var.db_cluster_id]] },
      { title = "CloudFront cache hit rate (%)", metrics = [["AWS/CloudFront", "CacheHitRate", "DistributionId", var.distribution_id, "Region", "Global", { region = "us-east-1" }]] },
      ] : {
      type       = "metric"
      x          = (index % 2) * 12
      y          = floor(index / 2) * 6
      width      = 12
      height     = 6
      properties = { title = widget.title, metrics = widget.metrics, region = data.aws_region.current.region, view = "timeSeries", period = 300 }
    }]
  })
}
