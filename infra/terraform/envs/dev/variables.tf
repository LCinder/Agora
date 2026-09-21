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
  description = <<-EOT
    Off here on purpose.

    Ten CloudWatch alarms are free per account and one environment's set is nine,
    so alarms in both environments would cost about 0,80 $ a month to be told
    about a dev environment nobody is on call for. In dev what tells you
    something broke is the test that just failed.

    The budget alarm and the alert topic are still created: a cost that runs away
    in dev is precisely the kind nobody notices.
  EOT
  type        = bool
  default     = false
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

variable "backups" {
  description = "Off here: what this table holds is the seed and a handful of test events, and a backup of that is a bill for nothing."
  type        = bool
  default     = false
}
