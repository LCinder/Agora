output "api_endpoint" {
  value = module.stack.api_endpoint
}

output "site_url" {
  value = module.stack.site_url
}

output "panel_bucket" {
  value = module.stack.panel_bucket
}

output "distribution_id" {
  value = module.stack.distribution_id
}

output "table_name" {
  value = module.stack.table_name
}

output "cognito_user_pool_id" {
  value = module.stack.cognito_user_pool_id
}

output "cognito_client_id" {
  value = module.stack.cognito_client_id
}

output "failed_jobs_queue_url" {
  value = module.stack.failed_jobs_queue_url
}

output "secret_parameters" {
  value = module.stack.secret_parameters
}
