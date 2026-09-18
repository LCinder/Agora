variable "infra_name" {
  type = string
}

variable "app_name" {
  description = "Commercial name, for the strings a person reads."
  type        = string
}

variable "environment" {
  type = string
}

variable "alert_email" {
  description = "Where budget and error alerts go. AWS sends a confirmation mail that has to be accepted."
  type        = string
}

variable "monthly_budget_amount" {
  description = "Amount that triggers the warning. Low on purpose: this architecture should cost almost nothing, so any real number means something changed."
  type        = string
  default     = "5"
}

variable "budget_currency" {
  description = "Currency of the budget above, as AWS Budgets expects it. USD unless your account is billed in euros, in which case EUR."
  type        = string
  default     = "USD"

  validation {
    condition     = contains(["USD", "EUR"], var.budget_currency)
    error_message = "Use USD or EUR."
  }
}

variable "function_names" {
  description = <<-EOT
    Every Lambda of this environment, by name.

    The alarms are per function and not one alarm on the Lambda namespace: an
    alarm with no dimensions adds up every function in the account, so in an
    account that has anything else in it, it fires for somebody else's code and
    stops being read.
  EOT
  type        = list(string)
}

variable "api_id" {
  description = "HTTP API to watch for server errors."
  type        = string
}

variable "table_name" {
  description = "DynamoDB table to watch for throttling."
  type        = string
}
