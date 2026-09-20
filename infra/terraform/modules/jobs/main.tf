/**
 * Scheduled work: the evening reminder and the change notices.
 *
 * This is the only place in the system allowed to read gsi3, the index that
 * maps an event to the devices interested in it. It has to: a reminder is
 * useless if you cannot tell who to send it to. Every other role denies itself
 * that index explicitly, which is what lets the panel show counts without ever
 * being able to show names.
 *
 * One function, two schedules, told apart by the payload:
 *
 *   * every hour on the hour, for the evening reminder. Hourly and not once at
 *     19:00 because the hour is a municipality's own setting: the function sends
 *     for the towns whose hour it is and returns in milliseconds for the rest.
 *   * every minute, to drain the outbox the panel writes into. That is how a
 *     cancellation reaches a phone within the minute without a queue, a stream or
 *     an open connection — and 1,440 invocations a day of a function that usually
 *     finds nothing is inside the free tier with room to spare.
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
}

data "aws_iam_policy_document" "notifications" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      # The devices to send to, a hundred at a time.
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      # The daily counters, the reminder mark and the notice's sent-at.
      "dynamodb:UpdateItem",
      # An order that has been dealt with leaves the outbox.
      "dynamodb:DeleteItem",
    ]
    resources = [var.table_arn, var.calendar_index_arn, var.reminders_index_arn]
  }
}

module "notifications" {
  source = "../lambda"

  name        = "${local.prefix}-notifications"
  source_dir  = "${var.lambda_source_root}/notifications"
  policy_json = data.aws_iam_policy_document.notifications.json
  timeout     = 120

  environment_variables = {
    TABLE_NAME  = var.table_name
    ENVIRONMENT = var.environment
  }
}

# ---------------------------------------------------------------------------
# What happens to a run that never happened.
#
# The outbox already survives a failed *send*: the order stays in the partition
# and the next minute tries again. What it does not survive is an invocation that
# never ran — a Lambda that could not start, a function error, a timeout — because
# the reminder's hour passes and nothing says it did.
#
# So the schedules keep those events instead of dropping them. Fourteen days of
# retention, which is long enough for somebody to come back from a feria and read
# what was lost, and a queue that costs nothing while it is empty (the first
# million requests a month are free, and an empty queue makes none).
# ---------------------------------------------------------------------------
resource "aws_sqs_queue" "failed_jobs" {
  name = "${local.prefix}-failed-jobs"

  message_retention_seconds = 1209600

  # Nothing in this queue is read by code: it is read by a person, with the AWS
  # CLI, when an alarm said the notification job was erroring.
  sqs_managed_sse_enabled = true
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
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = module.notifications.arn
      },
      {
        Effect   = "Allow"
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.failed_jobs.arn
      },
    ]
  })
}

# Every hour, in the time zone of the municipalities. Spain is one zone, but the
# schedule says so out loud rather than relying on it: getting this wrong sends a
# reminder at four in the morning. Which hour is each town's own setting, and the
# function compares it against the clock in their zone.
resource "aws_scheduler_schedule" "reminders" {
  name                         = "${local.prefix}-reminders"
  schedule_expression          = "cron(0 * * * ? *)"
  schedule_expression_timezone = "Europe/Madrid"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = module.notifications.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = "reminders" })

    # Worth retrying: the reminder of an evening only goes out once, and a
    # DynamoDB blip or a cold start that timed out is exactly what a retry fixes.
    # Ten minutes of attempts, then the event is kept rather than lost.
    retry_policy {
      maximum_retry_attempts       = 3
      maximum_event_age_in_seconds = 600
    }

    dead_letter_config {
      arn = aws_sqs_queue.failed_jobs.arn
    }
  }
}

# The outbox: a change of time, a cancellation, a live session starting. The
# product promises these arrive in under a minute, so this is the schedule that
# keeps that promise.
resource "aws_scheduler_schedule" "outbox" {
  name                = "${local.prefix}-outbox"
  schedule_expression = "rate(1 minute)"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = module.notifications.arn
    role_arn = aws_iam_role.scheduler.arn
    input    = jsonencode({ job = "outbox" })

    # Not worth retrying, and that is deliberate: another run starts in sixty
    # seconds and does the same work, so a retry would only double it. The failure
    # still goes to the queue, which is what makes a run that died visible.
    retry_policy {
      maximum_retry_attempts       = 0
      maximum_event_age_in_seconds = 60
    }

    dead_letter_config {
      arn = aws_sqs_queue.failed_jobs.arn
    }
  }
}
