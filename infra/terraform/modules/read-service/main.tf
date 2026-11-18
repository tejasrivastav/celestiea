data "aws_region" "current" {}

resource "aws_ecs_cluster" "this" {
  name = var.name
}

resource "aws_cloudwatch_log_group" "read_api" {
  name              = "/ecs/${var.name}/read-api"
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
  name               = "${var.name}-read-api-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secret" {
  name = "read-database-secret"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.database_secret_arn }]
  })
}

resource "aws_ecs_task_definition" "read_api" {
  family                   = "${var.name}-read-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([{
    name         = "read-api"
    image        = var.image
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = [for name, value in {
      PGHOST          = var.database_host
      PGDATABASE      = var.database_name
      PGUSER          = "catalog_reader"
      DATABASE_SSL    = "true"
      VALKEY_URL      = var.valkey_url
      LOG_LEVEL       = "info"
      ENABLE_GRAPHIQL = "false"
    } : { name = name, value = value }]
    # Injected by ECS at task start; never part of the image or the task definition.
    secrets = [{ name = "PGPASSWORD", valueFrom = "${var.database_secret_arn}:password::" }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.read_api.name
        awslogs-region        = data.aws_region.current.region
        awslogs-stream-prefix = "read-api"
      }
    }
  }])
}

resource "aws_lb" "this" {
  name               = var.name
  internal           = true
  load_balancer_type = "application"
  subnets            = var.subnet_ids
  security_groups    = [var.alb_security_group_id]
}

resource "aws_lb_target_group" "read_api" {
  name                 = "${var.name}-read-api"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = "/health/ready"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
  }
}

# Plain HTTP inside the VPC: TLS terminates at CloudFront and API Gateway, and the ALB
# is reachable only through the API Gateway VPC link.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.read_api.arn
  }
}

resource "aws_ecs_service" "read_api" {
  name            = "read-api"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.read_api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [var.service_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.read_api.arn
    container_name   = "read-api"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Autoscaling owns the task count after the first deploy.
  lifecycle {
    ignore_changes = [desired_count]
  }
}

resource "aws_appautoscaling_target" "read_api" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.read_api.name}"
  min_capacity       = var.desired_count
  max_capacity       = var.max_count
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-read-api-cpu"
  service_namespace  = aws_appautoscaling_target.read_api.service_namespace
  scalable_dimension = aws_appautoscaling_target.read_api.scalable_dimension
  resource_id        = aws_appautoscaling_target.read_api.resource_id
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
