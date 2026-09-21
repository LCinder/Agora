/**
 * Cognito, for municipal staff and associations only.
 *
 * Residents are not in here. They never create an account, never give an email
 * and are identified by a device token this platform issues; putting them in a
 * user pool would be paying in complexity for an identity they do not have.
 *
 * Cognito answers "who are you" and nothing else. Permissions live in the
 * table, because a role belongs to a municipality and Cognito groups know
 * nothing about municipalities. The practical gain: removing a departing
 * officer's access is deleting one row, not waiting for a token to expire.
 */

resource "aws_cognito_user_pool" "staff" {
  name = "${var.infra_name}-${var.environment}-staff"

  # Nobody signs themselves up. The town hall invites its own people and its
  # associations, which is also how the association ends up attached to the
  # right municipality.
  admin_create_user_config {
    allow_admin_create_user_only = true

    invite_message_template {
      email_subject = "Acceso al panel de ${var.app_name}"
      email_message = "Hola. Ya puedes entrar en el panel de ${var.app_name} con el usuario {username} y la contraseña temporal {####}."
      sms_message   = "Usuario {username}, contraseña temporal {####}"
    }
  }

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 14
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Cognito's own sender is free and capped at a few dozen mails a day. That is
  # plenty for inviting municipal staff, and it avoids setting up SES while
  # there are no customers.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  schema {
    name                = "full_name"
    attribute_data_type = "String"
    mutable             = true
    required            = false

    string_attribute_constraints {
      min_length = 1
      max_length = 200
    }
  }
}

resource "aws_cognito_user_pool_client" "panel" {
  name         = "${var.infra_name}-${var.environment}-panel"
  user_pool_id = aws_cognito_user_pool.staff.id

  # A browser cannot keep a secret, so it is not given one.
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}
