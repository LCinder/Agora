/**
 * Terraform state backend.
 *
 * Chicken and egg: the bucket that holds the state cannot itself live in that
 * state, so this stack is applied once with local state and its own state file
 * is committed. It creates almost nothing and changes almost never.
 *
 *   cd infra/terraform/bootstrap
 *   terraform init
 *   terraform apply -var-file=../terraform.tfvars
 *
 * The lock table exists because Terraform 1.5 has no native S3 locking. From
 * 1.10 onwards `use_lockfile = true` in the backend replaces it and the table
 * can be deleted.
 */

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = var.aws_profile

  # The machine that runs this has profiles for several unrelated AWS accounts.
  # Naming the account here turns "applied against the wrong one" from a
  # possible afternoon into an immediate error.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

resource "aws_s3_bucket" "state" {
  bucket = "${var.project}-tfstate-${var.aws_account_id}"

  # Losing this bucket means losing track of every resource Terraform created.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Old state versions are worth keeping for a while and worthless after that.
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

resource "aws_dynamodb_table" "lock" {
  name         = "${var.project}-tfstate-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
