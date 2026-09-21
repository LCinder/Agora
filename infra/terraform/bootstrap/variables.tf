variable "infra_name" {
  description = <<-EOT
    Prefix of every physical resource name. Stays "agora" for good.

    This is NOT the commercial name. Renaming it renames the DynamoDB table,
    the buckets and the user pool, and Terraform cannot rename those: it
    destroys and recreates them, which for the table means losing the data of
    every municipality. The name residents see lives in `app_name`, and in
    `packages/core/src/brand.json` for the applications.
  EOT
  type        = string
  default     = "agora"
}

variable "region" {
  description = "AWS region. Frankfurt: complete, mature and inside the EU."
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "Local AWS profile to use. Deliberately has no default: this machine has profiles for unrelated accounts."
  type        = string
}

variable "aws_account_id" {
  description = "Account this stack may be applied to. Anything else fails immediately."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "An AWS account id is exactly twelve digits."
  }
}

variable "github_repository" {
  description = "Owner and name of the repository allowed to deploy, as `owner/name`."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "Expected owner/name, for example LCinder/Agora."
  }
}

variable "github_deploy_environments" {
  description = <<-EOT
    Which GitHub environments may assume the deploy role.

    Not branches: a job that declares an environment gets a token whose subject
    names the environment and not the ref, so the branch is restricted in the
    environment's own settings in GitHub and not here. See the comment in
    github.tf, and step 3.2 of docs/primer-despliegue.md — that rule is what
    stops any branch from deploying, and it is not optional.
  EOT
  type        = list(string)
  default     = ["dev", "prod"]
}

variable "github_owner_id" {
  description = <<-EOT
    Numeric id of the repository's owner, for the immutable subject format.

    Repositories created after 15 July 2026 send a subject carrying the numeric
    owner and repository ids instead of their names, because a name can be
    recycled and impersonated. Both this and `github_repository_id` must be set to
    use it; leaving both empty keeps the older, name-only format.

      gh api repos/OWNER/NAME --jq '.owner.id, .id'
  EOT
  type        = string
  default     = ""
}

variable "github_repository_id" {
  description = "Numeric id of the repository. See github_owner_id."
  type        = string
  default     = ""
}
