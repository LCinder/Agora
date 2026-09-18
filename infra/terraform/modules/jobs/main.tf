/**
 * Scheduled work: the evening reminder and the change notices.
 *
 * This is the only place in the system allowed to read gsi3, the index that
 * maps an event to the devices interested in it. It has to: a reminder is
 * useless if you cannot tell who to send it to. Every other role denies itself
 * that index explicitly, which is what lets the panel show counts without ever
 * being able to show names.
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
  prefix = "${var.project}-${var.environment}"
}

data "aws_iam_policy_document" "reminders" {
  statement {
    effect  = "Allow"
    actions = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:UpdateItem"]
    resources = concat(
      [var.table_arn, var.reminders_index_arn],
      var.public_index_arns,
    )
  }
}

module "reminders" {
  source = "../lambda"

  name        = "${local.prefix}-reminders"
  source_dir  = "${var.lambda_source_root}/reminders"
  policy_json = data.aws_iam_policy_document.reminders.json
  timeout     = 120

  environment_variables = {
    TABLE_NAME  = var.table_name
    ENVIRONMENT = var.environment
  }
}

resource "aws_iam_role" "scheduler" {
  name = "${local.prefix}-scheduler"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  name = "invoke"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "lambda:InvokeFunction"
      Resource = module.reminders.arn
    }]
  })
}

# The evening before, in the time zone of the municipality. Spain is one zone,
# but the schedule says so out loud rather than relying on it: getting this
# wrong sends a reminder at four in the morning.
resource "aws_scheduler_schedule" "reminders" {
  name                         = "${local.prefix}-reminders"
  schedule_expression          = "cron(0 19 * * ? *)"
  schedule_expression_timezone = "Europe/Madrid"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = module.reminders.arn
    role_arn = aws_iam_role.scheduler.arn
  }
}
