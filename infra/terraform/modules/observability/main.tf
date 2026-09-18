/**
 * Knowing what this costs, and knowing when it breaks.
 *
 * The budget alarm is the first thing that gets created and the last thing to
 * remove. A bootstrapped project cannot afford to find out about a runaway
 * bill at the end of the month, and every free tier in this architecture has a
 * ceiling somebody could walk through by accident.
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

resource "aws_budgets_budget" "monthly" {
  name         = "${local.prefix}-monthly"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_eur
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Warn on the way up, not once it has happened.
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.alert_email]
  }
}

resource "aws_sns_topic" "alerts" {
  name = "${local.prefix}-alerts"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Errors in any function of this environment. One alarm rather than one per
# function: with a handful of Lambdas, a single "something is failing" signal
# is what actually gets read.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${local.prefix}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 5
  statistic           = "Sum"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  treat_missing_data  = "notBreaching"
  alarm_description   = "More than five Lambda errors in five minutes."
  alarm_actions       = [aws_sns_topic.alerts.arn]
}
