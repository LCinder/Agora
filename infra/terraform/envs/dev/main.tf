/**
 * Environment: dev
 *
 * A thin caller of modules/stack. Everything that differs between environments
 * lives in the variables below and nowhere else.
 */

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Filled in from the outputs of the bootstrap stack. Terraform does not allow
  # variables here, so the bucket name is written by hand, once.
  backend "s3" {
    key     = "dev/terraform.tfstate"
    region  = "eu-central-1"
    encrypt = true
    # bucket         = "agora-tfstate-<cuenta>"
    # dynamodb_table = "agora-tfstate-lock"
    # profile        = "<perfil>"
  }
}

provider "aws" {
  region = var.region

  # Empty in CI, where the identity is the assumed role and there is no profile
  # to name. Null rather than "" because the provider treats an empty profile as
  # a profile called "" and fails looking for it.
  profile = var.aws_profile == "" ? null : var.aws_profile

  # This machine has profiles for several unrelated AWS accounts. Naming the
  # account turns "applied against the wrong one" into an immediate error
  # rather than into an afternoon.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = var.infra_name
      Environment = "dev"
      ManagedBy   = "terraform"
    }
  }
}

module "stack" {
  source = "../../modules/stack"

  infra_name            = var.infra_name
  app_name              = var.app_name
  site_url              = var.site_url
  environment           = "dev"
  region                = var.region
  allowed_origins       = var.allowed_origins
  alert_email           = var.alert_email
  monthly_budget_amount = var.monthly_budget_amount
  budget_currency       = var.budget_currency
  metric_alarms         = var.metric_alarms
  backups               = var.backups
}
