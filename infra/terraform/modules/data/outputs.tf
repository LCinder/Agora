output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "table_arn" {
  value = aws_dynamodb_table.main.arn
}

output "reminders_index_arn" {
  description = "gsi3: only the reminder job may read it."
  value       = "${aws_dynamodb_table.main.arn}/index/gsi3"
}

output "public_index_arns" {
  description = "Indexes every read role may use."
  value = [
    "${aws_dynamodb_table.main.arn}/index/gsi1",
    "${aws_dynamodb_table.main.arn}/index/gsi2",
  ]
}
