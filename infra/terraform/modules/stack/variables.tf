variable "infra_name" {
  description = "Prefix of every physical resource name. Never follows the commercial name; see envs/*/variables.tf."
  type        = string
}

variable "app_name" {
  description = "Commercial name for the strings a person reads. Null means: read it from packages/core/src/brand.json."
  type        = string
  default     = null
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "allowed_origins" {
  description = "Origins allowed to call the writing endpoints. Not '*'."
  type        = list(string)
}

variable "alert_email" {
  type = string
}

variable "monthly_budget_amount" {
  description = "Amount that triggers the budget warning."
  type        = string
  default     = "5"
}

variable "budget_currency" {
  description = "Currency of the budget, as AWS Budgets expects it: USD, or EUR if the account is billed in euros."
  type        = string
  default     = "USD"
}
