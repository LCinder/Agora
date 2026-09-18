/**
 * The whole environment, in one place.
 *
 * `envs/dev` and `envs/prod` are thin callers of this module with different
 * variables. Keeping the composition here rather than duplicating it means dev
 * and prod cannot drift apart quietly, which is the usual way a staging
 * environment stops being a rehearsal of production.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  prefix             = "${var.project}-${var.environment}"
  lambda_source_root = "${path.module}/../../lambda-src"
}

# ---------------------------------------------------------------------------
# Secrets
#
# Parameter Store rather than Secrets Manager: the standard tier is free, and
# the feature Secrets Manager charges for is automatic rotation, which neither
# of these needs.
#
# Terraform creates them empty and is told to ignore the value from then on, so
# the real secret is written once with the CLI and never enters the state file.
# ---------------------------------------------------------------------------

resource "aws_ssm_parameter" "device_token_key" {
  name        = "/${local.prefix}/device-token-key"
  description = "Signs the tokens residents' devices use. Rotating it logs every device out, which is harmless: they re-register silently."
  type        = "SecureString"
  value       = "PENDIENTE"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "anthropic_key" {
  name        = "/${local.prefix}/anthropic-api-key"
  description = "Claude API key, used to read event posters."
  type        = "SecureString"
  value       = "PENDIENTE"

  lifecycle {
    ignore_changes = [value]
  }
}

# ---------------------------------------------------------------------------
# The pieces
# ---------------------------------------------------------------------------

module "data" {
  source = "../data"

  project     = var.project
  environment = var.environment
}

module "auth" {
  source = "../auth"

  project     = var.project
  environment = var.environment
  region      = var.region
}

module "storage" {
  source = "../storage"

  project     = var.project
  environment = var.environment
}

module "api" {
  source = "../api"

  project            = var.project
  environment        = var.environment
  lambda_source_root = local.lambda_source_root

  table_name          = module.data.table_name
  table_arn           = module.data.table_arn
  public_index_arns   = module.data.public_index_arns
  reminders_index_arn = module.data.reminders_index_arn

  cognito_issuer    = module.auth.issuer
  cognito_client_id = module.auth.user_pool_client_id

  media_bucket_name = module.storage.media_bucket_name
  media_bucket_arn  = module.storage.media_bucket_arn

  device_token_parameter_name  = aws_ssm_parameter.device_token_key.name
  device_token_secret_arn      = aws_ssm_parameter.device_token_key.arn
  anthropic_key_parameter_name = aws_ssm_parameter.anthropic_key.name
  anthropic_key_secret_arn     = aws_ssm_parameter.anthropic_key.arn

  allowed_origins = var.allowed_origins
}

module "web" {
  source = "../web"

  project            = var.project
  environment        = var.environment
  lambda_source_root = local.lambda_source_root

  table_name          = module.data.table_name
  table_arn           = module.data.table_arn
  reminders_index_arn = module.data.reminders_index_arn

  api_host = module.api.api_host

  media_bucket_name   = module.storage.media_bucket_name
  media_bucket_arn    = module.storage.media_bucket_arn
  media_bucket_domain = module.storage.media_bucket_domain
}

module "jobs" {
  source = "../jobs"

  project            = var.project
  environment        = var.environment
  lambda_source_root = local.lambda_source_root

  table_name          = module.data.table_name
  table_arn           = module.data.table_arn
  public_index_arns   = module.data.public_index_arns
  reminders_index_arn = module.data.reminders_index_arn
}

module "observability" {
  source = "../observability"

  project            = var.project
  environment        = var.environment
  alert_email        = var.alert_email
  monthly_budget_eur = var.monthly_budget_eur
}
