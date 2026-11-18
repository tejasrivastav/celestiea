data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}

# Private subnets only. There is no internet gateway and no NAT: AWS APIs are reached
# through VPC endpoints, so nothing in the VPC has a path to the internet.
resource "aws_subnet" "private" {
  for_each          = { for index, az in local.azs : az => index }
  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = cidrsubnet(var.cidr, 4, each.value)
  tags              = { Name = "${var.name}-private-${each.key}" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-private" }
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}

# Free gateway endpoint: ECR image layers, the seed bucket and Aurora's
# aws_s3 import all go through it.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
  tags              = { Name = "${var.name}-s3" }
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(["ecr.api", "ecr.dkr", "logs", "secretsmanager"])
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [for subnet in aws_subnet.private : subnet.id]
  security_group_ids  = [aws_security_group.this["endpoints"].id]
  tags                = { Name = "${var.name}-${each.key}" }
}

# All security groups and the traffic allowed between them, in one place.
locals {
  security_groups = {
    endpoints      = "VPC interface endpoints"
    vpc_link       = "API Gateway VPC link"
    alb            = "Internal ALB of the read API"
    read_service   = "Read API tasks"
    write_lambda   = "Write API Lambda"
    migrator       = "Migrator tasks"
    database_proxy = "RDS Proxy"
    database       = "Aurora cluster"
    cache          = "Valkey"
  }

  ingress_rules = {
    vpc_link_to_alb          = { to = "alb", from = "vpc_link", port = 80 }
    alb_to_read_service      = { to = "read_service", from = "alb", port = 3000 }
    read_service_to_database = { to = "database", from = "read_service", port = 5432 }
    migrator_to_database     = { to = "database", from = "migrator", port = 5432 }
    proxy_to_database        = { to = "database", from = "database_proxy", port = 5432 }
    write_lambda_to_proxy    = { to = "database_proxy", from = "write_lambda", port = 5432 }
    read_service_to_cache    = { to = "cache", from = "read_service", port = 6379 }
    write_lambda_to_cache    = { to = "cache", from = "write_lambda", port = 6379 }
  }
}

resource "aws_security_group" "this" {
  for_each    = local.security_groups
  name        = "${var.name}-${replace(each.key, "_", "-")}"
  description = each.value
  vpc_id      = aws_vpc.this.id
}

resource "aws_vpc_security_group_ingress_rule" "between_groups" {
  for_each                     = local.ingress_rules
  security_group_id            = aws_security_group.this[each.value.to].id
  referenced_security_group_id = aws_security_group.this[each.value.from].id
  ip_protocol                  = "tcp"
  from_port                    = each.value.port
  to_port                      = each.value.port
  description                  = replace(each.key, "_", " ")
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_https" {
  security_group_id = aws_security_group.this["endpoints"].id
  cidr_ipv4         = var.cidr
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "HTTPS from the VPC to AWS APIs"
}

# Egress is open within the security group model; with no internet gateway or NAT the
# only reachable destinations are inside the VPC and the endpoints.
resource "aws_vpc_security_group_egress_rule" "all" {
  for_each          = local.security_groups
  security_group_id = aws_security_group.this[each.key].id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
