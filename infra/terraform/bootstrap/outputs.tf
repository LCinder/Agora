output "state_bucket" {
  description = "Put this in the backend block of each environment."
  value       = aws_s3_bucket.state.id
}

output "lock_table" {
  description = "Put this in the backend block of each environment, until Terraform 1.10."
  value       = aws_dynamodb_table.lock.name
}

output "github_deploy_role_arn" {
  description = "Set this as the AWS_DEPLOY_ROLE variable in the repository's settings."
  value       = aws_iam_role.deploy.arn
}
