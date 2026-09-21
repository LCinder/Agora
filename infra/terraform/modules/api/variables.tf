variable "infra_name" {
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

variable "calendar_index_arn" {
  description = "gsi1: the public calendar. The only index a resident's request has any business in."
  type        = string
}

variable "review_index_arn" {
  description = "gsi2: the review queue, so unapproved events. The panel reads it; the public functions deny themselves access to it."
  type        = string
}

variable "reminders_index_arn" {
  description = "gsi3: who is interested in an event. Every role here denies itself access to it explicitly."
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

variable "poster_parameter_names" {
  description = <<-EOT
    Environment variables the poster function reads to find its credentials in
    Parameter Store, as {VARIABLE = parameter name}.

    A map rather than one variable per provider because the providers change:
    this started on Claude, moved to Gemini plus Cloudflare when a free tier
    became the requirement (D-024), and the next change should not have to
    touch this module's interface.
  EOT
  type        = map(string)
}

variable "poster_parameter_arns" {
  description = "The same parameters, as ARNs, for the function's policy."
  type        = list(string)
}

variable "allowed_origins" {
  description = "Where the panel is served from. Not '*': these endpoints write."
  type        = list(string)
}

variable "user_pool_id" {
  description = "The Cognito user pool the panel invites people into."
  type        = string
}

variable "user_pool_arn" {
  description = "Scope of the panel's permission to create an account."
  type        = string
}

variable "site_url" {
  description = "Where the public pages are served from, for their canonical and Open Graph URLs. Empty until there is a domain, and the page then omits those tags rather than writing them wrong."
  type        = string
}
