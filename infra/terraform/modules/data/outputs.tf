output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "table_arn" {
  value = aws_dynamodb_table.main.arn
}

output "calendar_index_arn" {
  description = "gsi1: published events of a municipality, by date. The only index a resident's request needs."
  value       = "${aws_dynamodb_table.main.arn}/index/gsi1"
}

output "review_index_arn" {
  description = "gsi2: events an association sent and the town hall has not decided on. Municipal roles only — an unapproved event is not the public's business."
  value       = "${aws_dynamodb_table.main.arn}/index/gsi2"
}

output "reminders_index_arn" {
  description = "gsi3: event to interested devices. Only the reminder job may read it."
  value       = "${aws_dynamodb_table.main.arn}/index/gsi3"
}

output "backup_role_arn" {
  description = "The role a restore runs as. Empty where backups are off."
  value       = try(aws_iam_role.backup[0].arn, "")
}
