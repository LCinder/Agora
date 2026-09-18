variable "project" {
  type = string
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

variable "monthly_budget_eur" {
  type    = string
  default = "5"
}
