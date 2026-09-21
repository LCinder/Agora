/**
 * The HTTP API and the functions behind it.
 *
 * HTTP API rather than REST API: about 70% cheaper and it has everything this
 * needs — a native JWT authorizer for Cognito, a Lambda authorizer for device
 * tokens, and CORS.
 *
 * Four functions rather than forty. With a team of two, forty functions are
 * forty deployments and forty places to look when something breaks. They are
 * split by who is calling, not by endpoint, because that is the line the
 * permissions follow.
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
  prefix = "${var.infra_name}-${var.environment}"

  common_env = {
    TABLE_NAME  = var.table_name
    ENVIRONMENT = var.environment
  }

  # Every method any route here uses, in one place because the two times this
  # broke it was two lists disagreeing. The CORS configuration reads it and so
  # do the panel routes: a method added to one is added to both.
  #
  # A method missing from the CORS list does not fail politely. API Gateway
  # answers the preflight with no Access-Control-Allow-Origin at all, and the
  # browser reports it as though the whole origin were refused — which sends
  # whoever is reading the console looking at the origin instead of the verb.
  api_methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
}

# ---------------------------------------------------------------------------
# What a resident sees. Read only, and never the reminder index.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "public_api" {
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [var.table_arn, var.calendar_index_arn]
  }

  # Belt and braces, and not only a formality. The review queue holds events
  # the town hall has not approved, and the reminder index holds who is
  # interested in what: neither is a resident's business, and neither is
  # granted above. Denying them out loud means no later edit can add one back
  # by widening a list.
  statement {
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = [var.review_index_arn, var.reminders_index_arn]
  }
}

module "public_api" {
  source = "../lambda"

  name                  = "${local.prefix}-public-api"
  source_dir            = "${var.lambda_source_root}/public-api"
  policy_json           = data.aws_iam_policy_document.public_api.json
  environment_variables = local.common_env
}

# ---------------------------------------------------------------------------
# A resident's own marks. Writes to its own device and to the event counter,
# and that is the entire blast radius.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "device_api" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [var.table_arn]
  }

  statement {
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = [var.review_index_arn, var.reminders_index_arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [var.device_token_secret_arn]
  }
}

module "device_api" {
  source = "../lambda"

  name        = "${local.prefix}-device-api"
  source_dir  = "${var.lambda_source_root}/device-api"
  policy_json = data.aws_iam_policy_document.device_api.json

  environment_variables = merge(local.common_env, {
    DEVICE_TOKEN_PARAMETER = var.device_token_parameter_name
  })
}

module "device_authorizer" {
  source = "../lambda"

  name        = "${local.prefix}-device-authorizer"
  source_dir  = "${var.lambda_source_root}/device-authorizer"
  policy_json = data.aws_iam_policy_document.device_api.json
  timeout     = 5

  environment_variables = merge(local.common_env, {
    DEVICE_TOKEN_PARAMETER = var.device_token_parameter_name
  })
}

# ---------------------------------------------------------------------------
# The town hall panel.
#
# The explicit Deny on gsi3 is the important line in this file. That index maps
# an event to the devices interested in it, and no municipal role may read it:
# the panel sees how many, never who. It is the promise the privacy policy
# makes, put where the code cannot go round it.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "panel_api" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
    ]
    resources = [var.table_arn, var.calendar_index_arn, var.review_index_arn]
  }

  statement {
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = [var.reminders_index_arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${var.media_bucket_arn}/*"]
  }

  # Inviting municipal staff and associations: the account in Cognito, and
  # reading back the subject of one that already exists, because a technician who
  # works for two neighbouring town halls signs in once. Creating the account is
  # all it may do — no listing users, no changing passwords, no deleting anybody.
  statement {
    effect = "Allow"
    actions = [
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminGetUser",
    ]
    resources = [var.user_pool_arn]
  }

  # Becoming somebody narrower for the length of one request: the role below,
  # with a session policy naming the municipality of the request (D-057). The ARN
  # is written out rather than referenced, because referencing it here and the
  # function's role there is a cycle Terraform cannot plan.
  statement {
    effect    = "Allow"
    actions   = ["sts:AssumeRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.prefix}-panel-session"]
  }
}

data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# The role a panel request actually runs as.
#
# Same table permissions as the function itself and not one more — what narrows
# it is the session policy the function attaches when it assumes this, which
# carries `dynamodb:LeadingKeys` for the municipality in the path. A session
# policy can only take permissions away, so this role is the ceiling and the
# request is always somewhere under it.
#
# The Deny on gsi3 is repeated here on purpose. It is the index that says which
# devices marked an event, no municipal role may read it (D-032), and a Deny that
# only exists in one of the two roles is a Deny that a refactor can drop.
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "panel_session_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "AWS"
      identifiers = [module.panel_api.role_arn]
    }
  }
}

resource "aws_iam_role" "panel_session" {
  name               = "${local.prefix}-panel-session"
  assume_role_policy = data.aws_iam_policy_document.panel_session_assume.json
}

data "aws_iam_policy_document" "panel_session" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:BatchGetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:ConditionCheckItem",
    ]
    resources = [var.table_arn, var.calendar_index_arn, var.review_index_arn]
  }

  statement {
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = [var.reminders_index_arn]
  }
}

resource "aws_iam_role_policy" "panel_session" {
  name   = "table"
  role   = aws_iam_role.panel_session.id
  policy = data.aws_iam_policy_document.panel_session.json
}

module "panel_api" {
  source = "../lambda"

  name        = "${local.prefix}-panel-api"
  source_dir  = "${var.lambda_source_root}/panel-api"
  policy_json = data.aws_iam_policy_document.panel_api.json
  timeout     = 20

  environment_variables = merge(local.common_env, {
    MEDIA_BUCKET = var.media_bucket_name
    USER_POOL_ID = var.user_pool_id

    # What to assume, and what the session policy is written against. Both, or
    # the function falls back to its own credentials and the fourth layer of
    # isolation quietly is not there.
    PANEL_SESSION_ROLE_ARN = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.prefix}-panel-session"
    TABLE_ARN              = var.table_arn
  })
}

# ---------------------------------------------------------------------------
# The poster function, both ways round: reading a poster and drawing one.
#
# Touches no table. It reads an image and asks a model what is on it, or takes
# a description and has one drawn, and either way a person confirms the result
# before anything is published.
#
# The providers are Gemini Flash for the text and Cloudflare Workers AI for the
# image, both on free tiers (D-024). Their credentials are the reason this runs
# in a Lambda at all rather than in the panel: a static site cannot keep a key.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "poster" {
  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = var.poster_parameter_arns
  }
}

module "poster" {
  source = "../lambda"

  name        = "${local.prefix}-poster"
  source_dir  = "${var.lambda_source_root}/poster"
  policy_json = data.aws_iam_policy_document.poster.json
  # Drawing is two calls to two providers, one of them a diffusion model, so
  # this is the slowest thing the API does. 29 seconds and not more because an
  # HTTP API cuts the integration off at 30: a longer timeout would only keep
  # the function running after the panel has already given up.
  timeout     = 29
  memory_size = 1024

  environment_variables = merge(
    { ENVIRONMENT = var.environment },
    var.poster_parameter_names,
  )
}

# ---------------------------------------------------------------------------
# The volunteer who carries the phone in the procession.
#
# Writes positions and reads the session they belong to, and that is the whole of
# it: no index, no other municipality, nothing about who marked an event. The
# event a volunteer may write to is inside their token, so there is no request
# that reaches another one.
#
# No authorizer in front of it, on purpose: an authorizer earns its keep by
# caching an answer across requests, and a position arrives every few seconds and
# is a write that has to happen anyway. Verifying inside the function costs the
# same and saves a moving part.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "volunteer" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
    ]
    resources = [var.table_arn]
  }

  statement {
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = [var.calendar_index_arn, var.review_index_arn, var.reminders_index_arn]
  }

  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = [var.device_token_secret_arn]
  }
}

module "volunteer" {
  source = "../lambda"

  name        = "${local.prefix}-volunteer"
  source_dir  = "${var.lambda_source_root}/volunteer"
  policy_json = data.aws_iam_policy_document.volunteer.json

  environment_variables = merge(local.common_env, {
    DEVICE_TOKEN_PARAMETER = var.device_token_parameter_name
  })
}

# ---------------------------------------------------------------------------
# The public event page
#
# The one thing in the product that needs HTML from a server, and only because
# of the Open Graph tags: without them a link shared on WhatsApp is a bare URL
# instead of a card with the title, the date and the town. That preview is the
# growth loop, so it earns its Lambda.
#
# It was a Lambda function URL, on the reasoning that a public page needs no
# gateway in front of it. That URL answered 403 from the first request: an
# account can refuse public function URLs outright, whatever the auth type and
# resource policy say, and this account does.
#
# A route on the API that already exists is the better shape anyway. One fewer
# public surface, one fewer CloudFront origin, and the same path every other
# handler takes.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "event_page" {
  statement {
    effect    = "Allow"
    actions   = ["dynamodb:GetItem", "dynamodb:Query"]
    resources = [var.table_arn]
  }

  # A link shared on WhatsApp reaches this page, so it is the most exposed thing
  # in the system. It gets the table and nothing else: not the review queue, not
  # who is interested.
  statement {
    effect    = "Deny"
    actions   = ["dynamodb:*"]
    resources = [var.review_index_arn, var.reminders_index_arn]
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
    # Where the page is served from, for its canonical and Open Graph URLs.
    # Until there is a domain it is the CloudFront one, and while it is empty
    # the page leaves those two tags out rather than writing them wrong.
    SITE_URL = var.site_url
  }
}

resource "aws_apigatewayv2_integration" "event_page" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = module.event_page.invoke_arn
  payload_format_version = "2.0"
}

# The handler reads the slug and the id out of the raw path, so the route only
# has to deliver the shape.
resource "aws_apigatewayv2_route" "event_page" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /e/{slug}/{eventId}"
  target    = "integrations/${aws_apigatewayv2_integration.event_page.id}"
}

# ---------------------------------------------------------------------------
# The API itself
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "main" {
  name          = local.prefix
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = concat(local.api_methods, ["OPTIONS"])
    allow_headers = ["content-type", "authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    # A runaway client, or somebody curious, must not be able to turn this into
    # a bill. These are generous for a few municipalities and cheap insurance.
    throttling_burst_limit = 200
    throttling_rate_limit  = 100
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId = "$context.requestId"
      method    = "$context.httpMethod"
      route     = "$context.routeKey"
      status    = "$context.status"
      latency   = "$context.responseLatency"
      error     = "$context.error.message"
    })
  }
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${local.prefix}"
  retention_in_days = 14
}

# Cognito tokens, validated by API Gateway itself before any code runs.
resource "aws_apigatewayv2_authorizer" "staff" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${local.prefix}-staff"

  jwt_configuration {
    audience = [var.cognito_client_id]
    issuer   = var.cognito_issuer
  }
}

# Device tokens are ours, so validating them is ours too. Cached for an hour:
# a device identity does not change, and a cache hit is a Lambda invocation
# that never happens.
resource "aws_apigatewayv2_authorizer" "device" {
  api_id                            = aws_apigatewayv2_api.main.id
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = module.device_authorizer.invoke_arn
  identity_sources                  = ["$request.header.Authorization"]
  name                              = "${local.prefix}-device"
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  authorizer_result_ttl_in_seconds  = 3600
}

locals {
  # Public reads. No authorizer: this is the calendar of a town, and it is
  # public the same way a poster on a wall is.
  public_routes = [
    "GET /municipalities",
    "GET /municipalities/{slug}",
    "GET /municipalities/{municipalityId}/events",
    "GET /municipalities/{municipalityId}/categories",
    "GET /municipalities/{municipalityId}/organizations",
    # Under the municipality, and not a bare `/events/{eventId}`: the partition
    # key of an event names its municipality, so a lookup that does not name one
    # would need an index or a scan of the whole table. Every link the product
    # produces already carries the town — `/e/<slug>/<id>` — so nothing is lost.
    "GET /municipalities/{municipalityId}/events/{eventId}",
    # Under its own prefix so CloudFront can give it a 5 second cache rule
    # without touching anything else.
    "GET /live/{eventId}",
  ]

  device_routes = [
    "GET /me/interests",
    "PUT /me/interests/{eventId}",
    "DELETE /me/interests/{eventId}",
    # That a phone opened an event, counted once a day. Behind the authorizer
    # like the rest: a tally anybody could post to is not a tally.
    "PUT /me/views/{eventId}",
    # Following a municipality: what the town hall's "dispositivos activos" is
    # counted from. One row per phone per town, and no name anywhere in it.
    "PUT /me/municipalities/{municipalityId}",
    # Where the notification job sends. Behind the device authorizer like the
    # rest: a token nobody signed cannot leave an address on somebody's phone.
    "PUT /me/push-token",
    "DELETE /me/push-token",
    # "Borrar mis datos": the device, its marks and its counters.
    "DELETE /me",
  ]
}

resource "aws_apigatewayv2_integration" "public_api" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = module.public_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "device_api" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = module.device_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "panel_api" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = module.panel_api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "volunteer" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = module.volunteer.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "poster" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = module.poster.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "public" {
  for_each = toset(local.public_routes)

  api_id    = aws_apigatewayv2_api.main.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.public_api.id}"
}

# Redeeming a code is public because the code is the credential, and emitting is
# authorised by the token the redemption returned, which the function checks
# itself.
resource "aws_apigatewayv2_route" "volunteer" {
  for_each = toset(["POST /volunteer/redeem", "POST /volunteer/positions"])

  api_id    = aws_apigatewayv2_api.main.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.volunteer.id}"
}

# Registering a device is public: it is how a resident gets the token every
# other /me route then requires.
resource "aws_apigatewayv2_route" "register_device" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /devices"
  target    = "integrations/${aws_apigatewayv2_integration.device_api.id}"
}

resource "aws_apigatewayv2_route" "device" {
  for_each = toset(local.device_routes)

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.device_api.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.device.id
}

# One route per method rather than ANY, and the reason is the browser.
#
# `ANY` matches OPTIONS too, so the CORS preflight hit the JWT authorizer —
# and a preflight never carries an Authorization header, because the spec says
# it must not. The authorizer answered 401. API Gateway still attached the CORS
# headers, so the response looked right at a glance, but a preflight has to
# return a 2xx: "Response to preflight request doesn't pass access control
# check: It does not have HTTP ok status."
#
# Listing the methods leaves OPTIONS unmatched, which is what lets the API's own
# CORS configuration answer it — before any authorizer runs. The device routes
# never had this because they were always spelled out one method at a time.
resource "aws_apigatewayv2_route" "panel" {
  for_each = toset(local.api_methods)

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = "${each.value} /panel/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.panel_api.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.staff.id
}

# `/poster` reads one, `/poster/generate` draws one. The panel calls both at
# these exact paths, so they are also what `next.config.ts` points at through
# NEXT_PUBLIC_POSTER_API_BASE.
resource "aws_apigatewayv2_route" "poster" {
  for_each = toset(["POST /poster", "POST /poster/generate"])

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.poster.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.staff.id
}

# ---------------------------------------------------------------------------
# Permission for API Gateway to invoke each function
# ---------------------------------------------------------------------------

locals {
  invokable = {
    public_api        = module.public_api.function_name
    device_api        = module.device_api.function_name
    panel_api         = module.panel_api.function_name
    poster            = module.poster.function_name
    event_page        = module.event_page.function_name
    volunteer         = module.volunteer.function_name
    device_authorizer = module.device_authorizer.function_name
  }
}

resource "aws_lambda_permission" "api" {
  for_each = local.invokable

  statement_id  = "AllowInvokeFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = each.value
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*"
}
