output "write_function_name" {
  description = "Write function name."
  value       = aws_lambda_function.this["write"].function_name
}

output "write_invoke_arn" {
  description = "Invoke ARN of the write function."
  value       = aws_lambda_function.this["write"].invoke_arn
}

output "authorizer_invoke_arn" {
  description = "Invoke ARN of the authorizer function."
  value       = aws_lambda_function.this["authorizer"].invoke_arn
}

output "function_names" {
  description = "Function name by role (write, authorizer)."
  value       = { for role, function in aws_lambda_function.this : role => function.function_name }
}

output "auth_token_secret_arn" {
  description = "Secret holding the admin bearer token."
  value       = aws_secretsmanager_secret.auth_token.arn
}

output "write_function_arn" {
  description = "Write function ARN."
  value       = aws_lambda_function.this["write"].arn
}
