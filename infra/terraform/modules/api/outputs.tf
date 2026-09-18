output "api_id" {
  value = aws_apigatewayv2_api.main.id
}

output "api_endpoint" {
  description = "Base URL of the API until there is a domain of our own."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "api_host" {
  value = replace(aws_apigatewayv2_api.main.api_endpoint, "https://", "")
}
