output "notifications_function_name" {
  value = module.notifications.function_name
}

output "function_names" {
  description = "The notification job, for the error alarms."
  value       = [module.notifications.function_name]
}
