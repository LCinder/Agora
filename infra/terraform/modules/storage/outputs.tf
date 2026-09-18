output "media_bucket_name" {
  value = aws_s3_bucket.media.id
}

output "media_bucket_arn" {
  value = aws_s3_bucket.media.arn
}

output "media_bucket_domain" {
  value = aws_s3_bucket.media.bucket_regional_domain_name
}
