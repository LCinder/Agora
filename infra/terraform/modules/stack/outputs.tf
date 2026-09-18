output "api_endpoint" {
  value = module.api.api_endpoint
}

output "site_url" {
  description = "Panel and public event pages, until there is a domain of our own."
  value       = "https://${module.web.distribution_domain}"
}

output "panel_bucket" {
  description = "Where the static export of the panel is uploaded."
  value       = module.web.panel_bucket
}

output "distribution_id" {
  description = "Needed to invalidate the cache after each panel deploy."
  value       = module.web.distribution_id
}

output "table_name" {
  value = module.data.table_name
}

output "cognito_user_pool_id" {
  value = module.auth.user_pool_id
}

output "cognito_client_id" {
  value = module.auth.user_pool_client_id
}

output "secret_parameters" {
  description = "Created empty on purpose. Fill them with the AWS CLI; see the README."
  value = [
    aws_ssm_parameter.device_token_key.name,
    aws_ssm_parameter.anthropic_key.name,
  ]
}
