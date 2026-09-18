variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "alert_email" {
  description = "Where budget and error alerts go. AWS sends a confirmation mail that has to be accepted."
  type        = string
}

variable "monthly_budget_eur" {
  description = "Amount that triggers the warning. Low on purpose: this architecture should cost almost nothing, so any real number means something changed."
  type        = string
  default     = "5"
}
