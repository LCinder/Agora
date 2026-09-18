output "distribution_domain" {
  description = "Where the panel and the public event pages live until there is a domain of our own."
  value       = aws_cloudfront_distribution.main.domain_name
}

output "distribution_id" {
  description = "Needed to invalidate the cache after deploying the panel."
  value       = aws_cloudfront_distribution.main.id
}

output "panel_bucket" {
  value = aws_s3_bucket.panel.id
}

output "function_names" {
  description = "The public event page, for the error alarms."
  value       = [module.event_page.function_name]
}
