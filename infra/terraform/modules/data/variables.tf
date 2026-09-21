variable "infra_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "backups" {
  description = "Daily backup of the table, kept 30 days. Off in dev, where the data is seed data."
  type        = bool
  default     = false
}
