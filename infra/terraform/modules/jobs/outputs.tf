output "notifications_function_name" {
  value = module.notifications.function_name
}

output "function_names" {
  description = "The notification job, for the error alarms."
  value       = [module.notifications.function_name]
}

output "failed_jobs_queue_url" {
  description = "Where a scheduled run that never happened is kept. Read it with the AWS CLI."
  value       = aws_sqs_queue.failed_jobs.url
}
