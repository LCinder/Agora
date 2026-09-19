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

variable "lambda_source_root" {
  type = string
}

variable "table_name" {
  type = string
}

variable "table_arn" {
  type = string
}

variable "review_index_arn" {
  description = "gsi2: unapproved events. The public page denies itself access to it."
  type        = string
}

variable "reminders_index_arn" {
  description = "gsi3: who is interested in an event. Denied here too."
  type        = string
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

variable "site_url" {
  description = <<-EOT
    Public address of the site, e.g. https://d111111abcdef8.cloudfront.net or
    https://hoyq.es. Used by the public event page for its canonical and Open
    Graph URLs, which have to be absolute.

    Empty is allowed and is what the first apply uses: the distribution does not
    exist yet, and the page leaves those tags out rather than writing a wrong one.
    Fill it in on the second apply with the `site_url` output.
  EOT
  type        = string
  default     = ""
}
