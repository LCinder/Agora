output "reminders_function_name" {
  value = module.reminders.function_name
}

output "function_names" {
  description = "The reminder job, for the error alarms."
  value       = [module.reminders.function_name]
}
