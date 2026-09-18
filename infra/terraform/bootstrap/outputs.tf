output "state_bucket" {
  description = "Put this in the backend block of each environment."
  value       = aws_s3_bucket.state.id
}

output "lock_table" {
  description = "Put this in the backend block of each environment, until Terraform 1.10."
  value       = aws_dynamodb_table.lock.name
}
