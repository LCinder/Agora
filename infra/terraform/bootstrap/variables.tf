variable "project" {
  description = "Short name used as a prefix for every resource."
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
