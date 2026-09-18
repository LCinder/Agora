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

variable "region" {
  description = "AWS region. Frankfurt: complete, mature and inside the EU."
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "Local AWS profile to use. Deliberately has no default: this machine has profiles for unrelated accounts."
  type        = string
}

variable "aws_account_id" {
  description = "Account this stack may be applied to. Anything else fails immediately."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "An AWS account id is exactly twelve digits."
  }
}
