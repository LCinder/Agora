/**
 * Where the posters live.
 *
 * Its own module rather than part of `web` to break a cycle: the api module
 * needs to write here, and the web module needs the api's hostname as a
 * CloudFront origin. With the bucket on its own, both depend on it and neither
 * depends on the other.
 *
 * The bucket is private. CloudFront reads it through an origin access control
 * created in the web module, which is also where its policy is attached,
 * because the policy has to name the distribution.
 */

resource "aws_s3_bucket" "media" {
  bucket = "${var.project}-${var.environment}-media"
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# A poster from a fiesta three years ago is nostalgia, not hot data.
resource "aws_s3_bucket_lifecycle_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "cheaper-storage-for-old-posters"
    status = "Enabled"

    filter {}

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }
}
