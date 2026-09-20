/**
 * Knowing what this costs, and knowing when it breaks.
 *
 * The budget alarm is the first thing that gets created and the last thing to
 * remove. A bootstrapped project cannot afford to find out about a runaway
 * bill at the end of the month, and every free tier in this architecture has a
 * ceiling somebody could walk through by accident.
 *
 * The alarms watch the three things that actually go wrong here: a function
 * erroring, the API answering 5xx, and the table throttling. Each one names
 * what it watches, because an alarm that adds up every Lambda in the account
 * fires for code that is not ours and then nobody reads it.
 *
 * They are created in production and not in dev, and the reason is the bill: ten
 * alarms are free per account and this set is exactly ten — eight functions, the
 * API and the table — so a second environment with alarms would cost about a
 * dollar a month for warnings about an environment nobody is on call for. The budget and the topic stay in both, because a
 * runaway cost in dev is exactly the kind that goes unnoticed.
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
  label  = "${var.app_name} (${var.environment})"
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.prefix}-monthly"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_amount
  limit_unit   = var.budget_currency
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

# One alarm per function, each naming its own. Five errors in five minutes is
# noise-tolerant enough for a retry storm and low enough to catch a function
# that is simply broken.
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = var.metric_alarms ? toset(var.function_names) : toset([])

  alarm_name          = "${each.value}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 5
  statistic           = "Sum"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  treat_missing_data  = "notBreaching"
  alarm_description   = "More than five errors in five minutes in ${each.value} — ${local.label}."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = each.value
  }
}

# A 5xx is the API failing, as opposed to a client sending nonsense, which is a
# 4xx and not something to wake anybody about.
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  count = var.metric_alarms ? 1 : 0

  alarm_name          = "${local.prefix}-api-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 5
  statistic           = "Sum"
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  treat_missing_data  = "notBreaching"
  alarm_description   = "The HTTP API is answering 5xx — ${local.label}."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ApiId = var.api_id
  }
}

# On-demand tables throttle when a partition gets hammered faster than DynamoDB
# expands it, which here would mean one event everybody is looking at — exactly
# what a procession is. It is the signal that the caching in front is not doing
# its job.
resource "aws_cloudwatch_metric_alarm" "table_throttles" {
  count = var.metric_alarms ? 1 : 0

  alarm_name          = "${local.prefix}-table-throttled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  period              = 300
  threshold           = 0
  statistic           = "Sum"
  namespace           = "AWS/DynamoDB"
  metric_name         = "ThrottledRequests"
  treat_missing_data  = "notBreaching"
  alarm_description   = "The table is throttling requests — ${local.label}."
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    TableName = var.table_name
  }
}
