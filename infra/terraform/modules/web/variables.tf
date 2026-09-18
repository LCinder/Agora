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

variable "reminders_index_arn" {
  type = string
}

variable "api_host" {
  description = "Host of the HTTP API, used as a CloudFront origin."
  type        = string
}

variable "media_bucket_name" {
  type = string
}

variable "media_bucket_arn" {
  type = string
}

variable "media_bucket_domain" {
  type = string
}
