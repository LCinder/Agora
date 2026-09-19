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
  prefix = "${var.infra_name}-${var.environment}"

  # One directory per function, produced by `pnpm --filter @agora/functions build`
  # (esbuild). The handlers used to be loose `.mjs` files zipped as they were,
  # which stopped working the moment they needed to import @agora/store: a Lambda
  # cannot import TypeScript from a workspace package. See D-035.
  lambda_source_root = "${path.module}/../../../../apps/functions/dist"

  # The commercial name is still pending, so it is read from the one file that
  # holds it — the same one the app and the panel read — instead of being
  # written here. `app_name` overrides it if an environment ever needs a
  # different label.
  brand    = jsondecode(file("${path.module}/../../../../packages/core/src/brand.json"))
  app_name = coalesce(var.app_name, local.brand.name)
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

# The poster reader and the poster drawer, which are two providers because both
# have a free tier and no single one does both jobs for nothing (D-024). The
# account id is not a secret and is stored as plain text; the two keys are not.
resource "aws_ssm_parameter" "gemini_key" {
  name        = "/${local.prefix}/gemini-api-key"
  description = "Gemini API key. Reads an event poster and writes the brief for the image model."
  type        = "SecureString"
  value       = "PENDIENTE"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "cloudflare_account" {
  name        = "/${local.prefix}/cloudflare-account-id"
  description = "Cloudflare account that runs Workers AI, which draws the posters."
  type        = "String"
  value       = "PENDIENTE"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "cloudflare_token" {
  name        = "/${local.prefix}/cloudflare-api-token"
  description = "Cloudflare API token with Workers AI permission, and nothing else."
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

  infra_name  = var.infra_name
  environment = var.environment
}

module "auth" {
  source = "../auth"

  infra_name  = var.infra_name
  app_name    = local.app_name
  environment = var.environment
  region      = var.region
}

module "storage" {
  source = "../storage"

  infra_name  = var.infra_name
  environment = var.environment
}

module "api" {
  source = "../api"

  infra_name         = var.infra_name
  environment        = var.environment
  lambda_source_root = local.lambda_source_root

  table_name          = module.data.table_name
  table_arn           = module.data.table_arn
  calendar_index_arn  = module.data.calendar_index_arn
  review_index_arn    = module.data.review_index_arn
  reminders_index_arn = module.data.reminders_index_arn

  cognito_issuer    = module.auth.issuer
  cognito_client_id = module.auth.user_pool_client_id
  user_pool_id      = module.auth.user_pool_id
  user_pool_arn     = module.auth.user_pool_arn

  media_bucket_name = module.storage.media_bucket_name
  media_bucket_arn  = module.storage.media_bucket_arn

  device_token_parameter_name = aws_ssm_parameter.device_token_key.name
  device_token_secret_arn     = aws_ssm_parameter.device_token_key.arn

  poster_parameter_names = {
    GEMINI_PARAMETER               = aws_ssm_parameter.gemini_key.name
    CLOUDFLARE_ACCOUNT_PARAMETER   = aws_ssm_parameter.cloudflare_account.name
    CLOUDFLARE_API_TOKEN_PARAMETER = aws_ssm_parameter.cloudflare_token.name
  }

  poster_parameter_arns = [
    aws_ssm_parameter.gemini_key.arn,
    aws_ssm_parameter.cloudflare_account.arn,
    aws_ssm_parameter.cloudflare_token.arn,
  ]

  allowed_origins = var.allowed_origins
}

module "web" {
  source = "../web"

  infra_name         = var.infra_name
  app_name           = local.app_name
  environment        = var.environment
  lambda_source_root = local.lambda_source_root

  table_name          = module.data.table_name
  table_arn           = module.data.table_arn
  review_index_arn    = module.data.review_index_arn
  reminders_index_arn = module.data.reminders_index_arn

  api_host = module.api.api_host
  site_url = var.site_url

  media_bucket_name   = module.storage.media_bucket_name
  media_bucket_arn    = module.storage.media_bucket_arn
  media_bucket_domain = module.storage.media_bucket_domain
}

module "jobs" {
  source = "../jobs"

  infra_name         = var.infra_name
  environment        = var.environment
  lambda_source_root = local.lambda_source_root

  table_name          = module.data.table_name
  table_arn           = module.data.table_arn
  calendar_index_arn  = module.data.calendar_index_arn
  reminders_index_arn = module.data.reminders_index_arn
}

module "observability" {
  source = "../observability"

  infra_name  = var.infra_name
  app_name    = local.app_name
  environment = var.environment
  alert_email = var.alert_email

  monthly_budget_amount = var.monthly_budget_amount
  budget_currency       = var.budget_currency
  metric_alarms         = var.metric_alarms

  # Every function of the environment, so each alarm names its own instead of
  # adding up whatever else lives in the account.
  function_names = concat(
    module.api.function_names,
    module.web.function_names,
    module.jobs.function_names,
  )

  api_id     = module.api.api_id
  table_name = module.data.table_name
}
