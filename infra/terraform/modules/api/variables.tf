variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "lambda_source_root" {
  description = "Directory holding one folder per function."
  type        = string
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
  description = "gsi3. Every role here denies itself access to it explicitly."
  type        = string
}

variable "cognito_issuer" {
  type = string
}

variable "cognito_client_id" {
  type = string
}

variable "media_bucket_name" {
  type = string
}

variable "media_bucket_arn" {
  type = string
}

variable "device_token_parameter_name" {
  type = string
}

variable "device_token_secret_arn" {
  type = string
}

variable "anthropic_key_parameter_name" {
  type = string
}

variable "anthropic_key_secret_arn" {
  type = string
}

variable "allowed_origins" {
  description = "Where the panel is served from. Not '*': these endpoints write."
  type        = list(string)
}
