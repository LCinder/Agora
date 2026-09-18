variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "lambda_source_root" {
  type = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "public_index_arns" {
  type = list(string)
}

variable "reminders_index_arn" {
  description = "gsi3. This module is the only one that may read it."
  type        = string
}
