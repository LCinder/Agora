output "user_pool_id" {
  value = aws_cognito_user_pool.staff.id
}

output "user_pool_arn" {
  value = aws_cognito_user_pool.staff.arn
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.panel.id
}

output "issuer" {
  description = "What the API Gateway JWT authorizer validates tokens against."
  value       = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.staff.id}"
}
