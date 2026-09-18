/**
 * One Lambda function, with its role, its policy and its log group.
 *
 * Used several times by the api, web and jobs modules. Three defaults are
 * deliberate:
 *
 *   * arm64, which is about 20% cheaper than x86 for the same work.
 *   * A log group with an explicit retention. Lambda creates one on its own
 *     with retention set to "forever", and logs nobody reads are the quiet way
 *     a free project starts costing money.
 *   * A policy passed in by the caller. There is no shared role: the function
 *     that reads the reminder index and the one that serves the panel must not
 *     be able to do each other's job.
 */

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

data "archive_file" "package" {
  type        = "zip"
  source_dir  = var.source_dir
  output_path = "${path.root}/.terraform/build/${var.name}.zip"
}

resource "aws_iam_role" "this" {
  name = var.name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.name}"
  retention_in_days = var.log_retention_days
}

resource "aws_iam_role_policy" "logs" {
  name = "logs"
  role = aws_iam_role.this.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.this.arn}:*"
    }]
  })
}

resource "aws_iam_role_policy" "custom" {
  count = var.policy_json == null ? 0 : 1

  name   = "access"
  role   = aws_iam_role.this.id
  policy = var.policy_json
}

resource "aws_lambda_function" "this" {
  function_name = var.name
  role          = aws_iam_role.this.arn
  handler       = var.handler
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  timeout       = var.timeout
  memory_size   = var.memory_size

  filename         = data.archive_file.package.output_path
  source_code_hash = data.archive_file.package.output_base64sha256

  environment {
    variables = var.environment_variables
  }

  depends_on = [aws_cloudwatch_log_group.this]
}
