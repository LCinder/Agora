variable "infra_name" {
  type = string
}

variable "app_name" {
  description = "Commercial name, for the strings a person reads."
  type        = string
}

variable "environment" {
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
