# CloudFront routes by path only. The method and path split happens here: GraphQL reads
# go to the read API over the VPC link, every other /v1 route to the write Lambda behind
# the authorizer.
resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_vpc_link" "this" {
  name               = var.name
  subnet_ids         = var.subnet_ids
  security_group_ids = [var.vpc_link_security_group_id]
}

resource "aws_apigatewayv2_integration" "read_api" {
  api_id             = aws_apigatewayv2_api.this.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  integration_uri    = var.read_api_listener_arn
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.this.id

  # Correlation ID for the read API logs.
  request_parameters = {
    "append:header.x-request-id" = "$context.requestId"
  }
}

resource "aws_apigatewayv2_integration" "write_api" {
  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_uri        = var.write_invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "bearer_token" {
  api_id                            = aws_apigatewayv2_api.this.id
  name                              = "bearer-token"
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = var.authorizer_invoke_arn
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  identity_sources                  = ["$request.header.Authorization"]
  authorizer_result_ttl_in_seconds  = 300
}

resource "aws_apigatewayv2_route" "read" {
  for_each  = toset(["GET /v1/graphql", "POST /v1/graphql"])
  api_id    = aws_apigatewayv2_api.this.id
  route_key = each.key
  target    = "integrations/${aws_apigatewayv2_integration.read_api.id}"
}

resource "aws_apigatewayv2_route" "write" {
  api_id             = aws_apigatewayv2_api.this.id
  route_key          = "ANY /v1/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.write_api.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.bearer_token.id
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      route     = "$context.routeKey"
      status    = "$context.status"
      latencyMs = "$context.responseLatency"
      error     = "$context.error.message"
    })
  }
}

resource "aws_lambda_permission" "invoke" {
  for_each      = var.function_names
  statement_id  = "allow-api-gateway"
  action        = "lambda:InvokeFunction"
  function_name = each.value
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.this.execution_arn}/*"
}
