variable "project" {
  type    = string
  default = "agora"
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

variable "monthly_budget_eur" {
  type    = string
  default = "5"
}
