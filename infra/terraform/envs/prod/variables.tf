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
  description = <<-EOT
    Local AWS profile to apply with. Empty in CI.

    Empty means "use whatever credentials are in the environment", which is what
    a GitHub Actions job has after assuming the deploy role. On a laptop it must
    be named: that machine has profiles for unrelated accounts, and
    `allowed_account_ids` is what turns a mistake there into an immediate error
    rather than into an afternoon.
  EOT
  type        = string
  default     = ""
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

variable "metric_alarms" {
  description = "On here: this is the environment where a failure is a municipality's problem and nobody is reading the logs. Ten alarms, which is exactly what is free per account."
  type        = bool
  default     = true
}

variable "backups" {
  description = "Daily copy of the table, kept 30 days. On here, because what is in this table is a real municipality's calendar and the mistakes worth insuring against are ours. Priced per gigabyte of what is stored: megabytes are céntimos."
  type        = bool
  default     = true
}

variable "budget_currency" {
  description = "Currency of the budget above: USD, or EUR if your account is billed in euros."
  type        = string
  default     = "USD"
}

variable "site_url" {
  description = "Public address of the site, for the public event page. Empty on the first apply; then fill it with the site_url output."
  type        = string
  default     = ""
}
