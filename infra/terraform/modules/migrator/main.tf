data "aws_region" "current" {}

resource "aws_cloudwatch_log_group" "migrator" {
  name              = "/ecs/${var.name}/migrator"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.name}-migrator-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-database-secrets"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [var.master_secret_arn, var.reader_secret_arn, var.writer_secret_arn]
    }]
  })
}

# Run on demand with `aws ecs run-task` (see the Makefile): "migrate" on every deploy,
# "import-seed --bucket ..." to load the catalog. Nothing runs migrations at app startup.
resource "aws_ecs_task_definition" "migrator" {
  family                   = "${var.name}-migrator"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name      = "migrator"
    image     = var.image
    essential = true
    command   = ["dist/main.mjs", "migrate"]
    environment = [for name, value in {
      PGHOST       = var.database_host
      PGDATABASE   = var.database_name
      PGUSER       = var.master_username
      DATABASE_SSL = "true"
      AWS_REGION   = data.aws_region.current.region
    } : { name = name, value = value }]
    secrets = [
      { name = "PGPASSWORD", valueFrom = "${var.master_secret_arn}:password::" },
      { name = "CATALOG_READER_PASSWORD", valueFrom = "${var.reader_secret_arn}:password::" },
      { name = "CATALOG_WRITER_PASSWORD", valueFrom = "${var.writer_secret_arn}:password::" },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.migrator.name
        awslogs-region        = data.aws_region.current.region
        awslogs-stream-prefix = "migrator"
      }
    }
  }])
}
