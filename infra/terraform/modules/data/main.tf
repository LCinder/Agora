/**
 * The single DynamoDB table.
 *
 * Everything the product stores lives here: municipalities, events,
 * associations, staff memberships, interests, live positions and daily
 * aggregates. The key design is documented in docs/fase-2-aws.md.
 *
 * Two properties of this table carry guarantees the application cannot break:
 *
 *   * The partition key always names a municipality, so a query that does not
 *     name one cannot exist.
 *   * gsi1 and gsi2 are sparse. An event only appears in them once it is
 *     published or sent for review, which makes the public calendar physically
 *     unable to return an unapproved event. The same holds for the lines of a
 *     programme, with one extra condition: an activity is written into the
 *     calendar index only when its own state **and its event's** allow it, so
 *     the programme of a draft cannot leak one activity at a time.
 */

resource "aws_dynamodb_table" "main" {
  name         = "${var.infra_name}-${var.environment}"
  billing_mode = "PAY_PER_REQUEST" # No capacity to reserve, nothing to pay when idle.
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  attribute {
    name = "gsi2pk"
    type = "S"
  }

  attribute {
    name = "gsi2sk"
    type = "S"
  }

  attribute {
    name = "gsi3pk"
    type = "S"
  }

  attribute {
    name = "gsi3sk"
    type = "S"
  }

  # The resident calendar: published and cancelled events of a municipality —
  # and the lines of their programmes — ordered by date. Sparse: `gsi1pk` is
  # only written once the row is visible. Events and activities share it on
  # purpose: they belong in the public calendar under the same conditions, and a
  # second index would be a second set of sparse attributes to keep in step.
  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  # The review queue: events an association sent and the town hall has not
  # decided on. Sparse, and empty most of the time, which is the point.
  global_secondary_index {
    name            = "gsi2"
    hash_key        = "gsi2pk"
    range_key       = "gsi2sk"
    projection_type = "ALL"
  }

  # Event — or one line of its programme — to the devices interested in it. Read
  # by the reminder job and by nothing else: no municipal role has permission on
  # this index. See modules/api.
  global_secondary_index {
    name            = "gsi3"
    hash_key        = "gsi3pk"
    range_key       = "gsi3sk"
    projection_type = "KEYS_ONLY"
  }

  # Live positions carry an expiry. DynamoDB deletes them on its own, which is
  # how the GDPR purge of the detailed trail stops being a scheduled job
  # somebody has to remember to write.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # There is deliberately no `point_in_time_recovery` block: nothing here costs
  # money for existing, and that is the constraint the whole architecture is
  # built on (D-026).
  #
  # What it buys over the daily backup below: a continuous log of changes for 35
  # days, so a migration that overwrites a municipality's programme can be
  # restored to the second before it ran rather than to four in the morning. It is
  # the more expensive of the two by a wide margin, and the daily copy covers the
  # mistake that actually happens.
  #
  #     point_in_time_recovery { enabled = true }
  #
  # Worth reconsidering the day losing an afternoon of a town hall's edits is a
  # phone call rather than a shrug.

  # Deletion protection stays, because it is free and stops a different mistake:
  # AWS refuses to delete the table at all, whoever asks and however — a
  # `terraform destroy`, a console click, a script. Off in dev, where throwing the
  # environment away is a normal afternoon.
  deletion_protection_enabled = var.environment == "prod"

  lifecycle {
    # And this one stops Terraform from planning a replacement — which is what
    # renaming the table would be, or adding an attribute to a key. `false`
    # while there is no real municipality in it; `true` the day there is.
    prevent_destroy = false
  }
}

# ---------------------------------------------------------------------------
# Copies of it, for the mistakes that are ours.
#
# Replication across three availability zones is automatic and protects against
# none of the things that actually happen: a migration that overwrites a
# municipality's programme, a delete with the wrong key, a bug that empties a
# partition. There is no free version of that in DynamoDB — but there is a very
# cheap one, and the difference between "cheap" and "free" stops mattering the
# day a real town hall's calendar is in here.
#
# A daily on-demand backup, kept for thirty days, priced per gigabyte of what is
# actually stored: a 50 MB table is half a céntimo a month. Point-in-time
# recovery is the other option and was turned down on purpose (D-036): it keeps
# a continuous log rather than a daily snapshot, and it is the one that costs
# real money.
#
# Restoring makes a **new table**, which is the safe thing: the damaged one is
# still there to look at. The procedure is in infra/terraform/README.md.
# ---------------------------------------------------------------------------
resource "aws_backup_vault" "main" {
  count = var.backups ? 1 : 0

  name = "${var.infra_name}-${var.environment}"
}

data "aws_iam_policy_document" "backup_assume" {
  count = var.backups ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  count = var.backups ? 1 : 0

  name               = "${var.infra_name}-${var.environment}-backup"
  assume_role_policy = data.aws_iam_policy_document.backup_assume[0].json
}

# AWS's own managed policy for this, rather than a hand-written one: it is the
# list of permissions AWS Backup needs to back up and restore, and keeping our
# own copy of it in step with their service is work with no upside.
resource "aws_iam_role_policy_attachment" "backup" {
  count = var.backups ? 1 : 0

  role       = aws_iam_role.backup[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_backup_plan" "daily" {
  count = var.backups ? 1 : 0

  name = "${var.infra_name}-${var.environment}-daily"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.main[0].name

    # Four in the morning in Madrid, which is both the quietest hour and after
    # the evening's reminders have gone out.
    schedule                     = "cron(0 3 * * ? *)"
    schedule_expression_timezone = "Europe/Madrid"

    # An hour to start and four to finish: generous for a table this size, and
    # what stops a backup window from being the reason one is skipped.
    start_window      = 60
    completion_window = 240

    lifecycle {
      delete_after = 30
    }
  }
}

resource "aws_backup_selection" "table" {
  count = var.backups ? 1 : 0

  name         = "${var.infra_name}-${var.environment}-table"
  iam_role_arn = aws_iam_role.backup[0].arn
  plan_id      = aws_backup_plan.daily[0].id

  resources = [aws_dynamodb_table.main.arn]
}
