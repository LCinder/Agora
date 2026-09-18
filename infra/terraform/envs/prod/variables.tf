variable "infra_name" {
  description = <<-EOT
    Prefix of every physical resource name. Stays "agora" for good.

    This is NOT the commercial name. Renaming it renames the DynamoDB table,
    the buckets and the user pool, and Terraform cannot rename those: it
    destroys and recreates them, which for the table means losing the data of
    every municipality. The name residents see lives in `app_name`, and in
    `packages/core/src/brand.json` for the applications.
  EOT
  type        = string
  default     = "agora"
}

variable "app_name" {
  description = <<-EOT
    Commercial name, for the few places a person reads it: the invitation email
    to municipal staff, the CloudFront comment and the alarm descriptions.

    Leave it unset and it is read from `packages/core/src/brand.json`, which is
    the one file to edit the day the product gets its name.
  EOT
  type        = string
  default     = null
}

variable "region" {
  type    = string
  default = "eu-central-1"
}

variable "aws_profile" {
  description = "No default on purpose: this machine has profiles for unrelated accounts."
  type        = string
}

variable "aws_account_id" {
  type = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "An AWS account id is exactly twelve digits."
  }
}

variable "allowed_origins" {
  type = list(string)
}

variable "alert_email" {
  type = string
}

variable "monthly_budget_amount" {
  description = "Amount that triggers the budget warning. Low on purpose: this architecture should cost almost nothing."
  type        = string
  default     = "5"
}

variable "budget_currency" {
  description = "Currency of the budget above: USD, or EUR if your account is billed in euros."
  type        = string
  default     = "USD"
}
