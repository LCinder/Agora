/**
 * What the world sees: the panel, the posters and the public event page.
 *
 * CloudFront is the reason this architecture is free rather than merely cheap.
 * Its permanent free tier covers a terabyte of traffic and ten million
 * requests a month, and the `/live/*` behaviour below turns the most expensive
 * thing the product does into a cache hit:
 *
 *   5.000 neighbours polling every 5 seconds during a procession
 *     = 1.000 requests per second at the edge
 *     = one request every five seconds at the origin
 *
 * That is why live tracking does not need WebSockets, connection registries or
 * a fan-out worker.
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
  prefix = "${var.project}-${var.environment}"
}

# ---------------------------------------------------------------------------
# Buckets. Both private: everything is served through CloudFront.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "panel" {
  bucket = "${local.prefix}-panel"
}

resource "aws_s3_bucket_public_access_block" "panel" {
  bucket                  = aws_s3_bucket.panel.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# The public event page
#
# The one thing here that needs a server, and only because of the Open Graph
# tags: without them a link shared on WhatsApp is a bare URL instead of a card
# with the title, the date and the town. That preview is the product's growth
# loop, so it earns its Lambda.
#
# A function URL rather than an API Gateway route: one fewer moving part, and
# the page is public anyway, so there is no secret for the open URL to leak.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "event_page" {
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [var.table_arn]
  }

  statement {
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = [var.reminders_index_arn]
  }
}

module "event_page" {
  source = "../lambda"

  name        = "${local.prefix}-event-page"
  source_dir  = "${var.lambda_source_root}/event-page"
  policy_json = data.aws_iam_policy_document.event_page.json

  environment_variables = {
    TABLE_NAME  = var.table_name
    ENVIRONMENT = var.environment
  }
}

resource "aws_lambda_function_url" "event_page" {
  function_name      = module.event_page.function_name
  authorization_type = "NONE"
}

# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "panel" {
  name                              = "${local.prefix}-panel"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${local.prefix}-media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Five seconds. The acceptance criterion asks for a position every 5-10
# seconds, so the staleness is inside what the product promises, and the saving
# is the difference between a cache and a bill.
resource "aws_cloudfront_cache_policy" "live" {
  name        = "${local.prefix}-live"
  min_ttl     = 0
  default_ttl = 5
  max_ttl     = 5

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

# The calendar changes when a municipal officer publishes something, and a
# minute of delay for a neighbour is not a problem worth paying to avoid.
resource "aws_cloudfront_cache_policy" "calendar" {
  name        = "${local.prefix}-calendar"
  min_ttl     = 0
  default_ttl = 60
  max_ttl     = 300

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip = true

    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "all"
    }
  }
}

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  comment             = local.prefix
  price_class         = "PriceClass_100" # Europe and North America. The audience is one Andalusian town.

  origin {
    origin_id                = "panel"
    domain_name              = aws_s3_bucket.panel.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.panel.id
  }

  origin {
    origin_id                = "media"
    domain_name              = var.media_bucket_domain
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  origin {
    origin_id   = "api"
    domain_name = var.api_host

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    origin_id   = "event-page"
    domain_name = replace(aws_lambda_function_url.event_page.function_url, "/^https?://([^/]*).*$/", "$1")

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # The panel: a static single page application.
  default_cache_behavior {
    target_origin_id       = "panel"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern           = "/media/*"
    target_origin_id       = "media"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true
  }

  # The one that matters. See the note at the top of this file.
  ordered_cache_behavior {
    path_pattern           = "/live/*"
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = aws_cloudfront_cache_policy.live.id
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern           = "/municipalities*"
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = aws_cloudfront_cache_policy.calendar.id
    compress               = true
  }

  ordered_cache_behavior {
    path_pattern           = "/e/*"
    target_origin_id       = "event-page"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = aws_cloudfront_cache_policy.calendar.id
    compress               = true
  }

  # A single page application routes on the client, so a deep link must be
  # answered with the shell rather than with a 404.
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# ---------------------------------------------------------------------------
# Only this distribution may read the buckets
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "panel_bucket" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.panel.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

data "aws_iam_policy_document" "media_bucket" {
  statement {
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${var.media_bucket_arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "panel" {
  bucket = aws_s3_bucket.panel.id
  policy = data.aws_iam_policy_document.panel_bucket.json
}

resource "aws_s3_bucket_policy" "media" {
  bucket = var.media_bucket_name
  policy = data.aws_iam_policy_document.media_bucket.json
}
