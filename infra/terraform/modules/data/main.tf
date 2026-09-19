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
 *     unable to return an unapproved event.
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

  # The resident calendar: published and cancelled events of a municipality,
  # ordered by date. Sparse: `gsi1pk` is only written once an event is visible.
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

  # Event to interested devices. Read by the reminder job and by nothing else:
  # no municipal role has permission on this index. See modules/api.
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
  # What it buys, for whoever reads this before the first pilot: it keeps a
  # continuous log of changes for 35 days, so a migration that overwrites a
  # municipality's programme can be restored to the second before it ran. It is
  # the only thing in DynamoDB that recovers from our own mistakes — replication
  # across three availability zones is automatic and protects against none of
  # them — and there is no free version of it: on-demand backups are billed per
  # gigabyte too.
  #
  # At pilot size the table is megabytes, so it would be cents a month:
  #
  #     point_in_time_recovery { enabled = true }
  #
  # Worth turning on in production the day a real municipality's events are in
  # here rather than seed data. Until then there is nothing to lose.

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
