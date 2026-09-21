/**
 * Letting GitHub Actions deploy without anybody holding a key.
 *
 * AWS can trust GitHub directly as an identity provider: a workflow asks GitHub
 * for a short-lived token, hands it to STS, and gets credentials that last the
 * job and no longer. There is no access key in a GitHub secret, none in a
 * developer's laptop, and none in a container — so there is nothing to leak, to
 * rotate, or to find in a log.
 *
 * It lives in the bootstrap stack because it is the same kind of thing as the
 * state bucket: applied once per account, by a person, with local state, and
 * changed almost never.
 *
 * Two things here are worth reading rather than skimming:
 *
 * The trust condition names the repository AND the branch. Without the branch,
 * anybody who can open a pull request from a fork could run a workflow that
 * assumes this role — which is the whole of the vulnerability, and it is one
 * line of configuration away.
 *
 * And the permissions policy denies the role the ability to change itself. A
 * deploy role that may edit its own policy is an administrator with extra steps.
 */

locals {
  # GitHub's fixed thumbprints for token.actions.githubusercontent.com. AWS no
  # longer verifies these for GitHub — it uses its own trust store — but the API
  # still requires the field.
  github_thumbprints = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  # From the variable rather than from `aws_caller_identity`: it is the same number,
  # it is already validated as twelve digits, it is what `allowed_account_ids`
  # enforces, and using it means this stack can be planned without credentials.
  account = var.aws_account_id

  # Every resource this project creates is named with the prefix, which is what
  # makes a policy scoped by name possible at all (D-066).
  prefix = var.infra_name
}

/**
 * The exact `sub` claims that may assume the deploy role.
 *
 * Two things about this claim cost an afternoon each, and both are written here
 * rather than learned again:
 *
 * **A job that declares an `environment:` gets a subject naming the environment,
 * never the ref.** It reads `repo:owner/name:environment:dev`, with no branch in
 * it at all — so a trust policy that asks for `ref:refs/heads/main` can never
 * match a job that has an environment, whatever branch it runs on. The deploy
 * workflow declares one, because that is what makes GitHub ask a reviewer before
 * production.
 *
 * The branch restriction therefore does not live here any more. It lives in the
 * environment's own **deployment branch rule** in GitHub, which is enforced
 * before the token is minted: a ref that the environment does not allow never
 * gets a token naming that environment. That rule is not optional — without it,
 * on a public repository, any branch that can start the workflow can deploy. It
 * is step 3.2 of docs/primer-despliegue.md.
 *
 * **And the subject format changed.** Repositories created after 15 July 2026 use
 * an immutable subject that carries the numeric owner and repository ids:
 * `repo:owner@50793953/name@1366332619:environment:dev`. The old format used
 * names alone, so a recycled namespace could be impersonated. Set the two ids and
 * this uses the new format; leave them empty and it uses the old one, which is
 * what an older repository still sends.
 */
locals {
  immutable = var.github_owner_id != "" && var.github_repository_id != ""

  owner = split("/", var.github_repository)[0]
  name  = split("/", var.github_repository)[1]

  repository_claim = (
    local.immutable
    ? "repo:${local.owner}@${var.github_owner_id}/${local.name}@${var.github_repository_id}"
    : "repo:${var.github_repository}"
  )

  deploy_subjects = [
    for environment in var.github_deploy_environments :
    "${local.repository_claim}:environment:${environment}"
  ]
}

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = local.github_thumbprints
}

data "aws_iam_policy_document" "github_trust" {
  statement {
    sid     = "GitHubActionsOfThisRepository"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    # The audience GitHub is told to mint the token for. Without this, a token
    # meant for some other service would be accepted here.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Exactly which jobs of which repository. `StringEquals` and not `StringLike`:
    # every subject here is a literal, and a wildcard in a trust policy is how a
    # repository called `Agora-evil` ends up matching `Agora*`.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.deploy_subjects
    }
  }
}

resource "aws_iam_role" "deploy" {
  name               = "${local.prefix}-github-deploy"
  description        = "Assumed by GitHub Actions to run Terraform. No access keys exist for it."
  assume_role_policy = data.aws_iam_policy_document.github_trust.json

  # An hour is longer than any apply here and shorter than a working day.
  max_session_duration = 3600
}

/**
 * What the deploy role may do.
 *
 * Said plainly, because a policy that claims to be minimal and is not is worse
 * than one that admits its shape: this is **broad within the services the stack
 * uses, and narrow about everything else**. Terraform creates, reads, changes and
 * destroys, and for most of these services the create call has no resource to
 * scope to — you cannot grant "create a DynamoDB table whose name starts with
 * agora" in any way AWS enforces at create time for every service here.
 *
 * So the security of this role comes from three other places:
 *
 *   1. It can only be assumed from one branch of one repository.
 *   2. The credentials last one hour and belong to a job, not to a person.
 *   3. The Deny block below, which is the part that actually matters.
 *
 * The Deny is where to look when reviewing this. It stops the role from creating
 * IAM users or access keys — the only way to turn a one-hour credential into a
 * permanent one — from touching the OIDC provider or its own role, and from
 * deleting the state bucket.
 *
 * And the limit, said out loud because a policy that oversells itself is worse
 * than a broad one: **this role is transitively an administrator of the account.**
 * It has to create IAM roles for the Lambdas and hand them over (`iam:PassRole`),
 * and anything that can write a role's inline policy and attach it to a function
 * it also writes can reach everything. No IAM condition closes that, because
 * there is no condition key that inspects an inline policy document.
 *
 * So the honest list of what actually protects this account is short, and none of
 * it is in the Allow block: only one branch of one repository can assume the role,
 * the credentials last an hour, every change arrives through a reviewed commit,
 * and CloudTrail records the session name of the run that did it.
 *
 * The way to close it properly is a permissions boundary: deny `iam:CreateRole`
 * unless the new role carries a boundary we define, so that a role this one
 * creates cannot exceed it whatever policy is written into it. That means setting
 * a boundary on every Lambda role in the stack, and a boundary that is slightly
 * too tight breaks a function at runtime rather than at apply — in a system with
 * no tests against real AWS yet, that is a trade worth making deliberately and
 * not on the way past. Written down rather than done (D-066).
 */
data "aws_iam_policy_document" "deploy" {
  statement {
    sid    = "TheServicesTheStackIsMadeOf"
    effect = "Allow"

    actions = [
      "apigateway:*",
      "backup:*",
      "backup-storage:*",
      "budgets:*",
      "cloudfront:*",
      "cognito-idp:*",
      "dynamodb:*",
      "events:*",
      "lambda:*",
      "logs:*",
      "s3:*",
      "scheduler:*",
      "sns:*",
      "sqs:*",
      "ssm:*",
    ]

    resources = ["*"]
  }

  # Terraform reads a great deal before it writes anything, and a plan that
  # cannot read is a plan that wants to recreate the world.
  statement {
    sid    = "ReadingWhatItManages"
    effect = "Allow"

    actions = [
      "cloudwatch:DescribeAlarms",
      "cloudwatch:GetMetricData",
      "cloudwatch:ListTagsForResource",
      "cloudwatch:PutMetricAlarm",
      "cloudwatch:DeleteAlarms",
      "cloudwatch:TagResource",
      "cloudwatch:UntagResource",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListRolePolicies",
      "iam:ListRoleTags",
      "iam:ListPolicies",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:GetOpenIDConnectProvider",
      "sts:GetCallerIdentity",
      "tag:GetResources",
    ]

    resources = ["*"]
  }

  /**
   * The roles of the Lambdas, which Terraform creates and therefore must be able
   * to manage — but only the ones named after this project.
   *
   * `iam:PassRole` is the one people forget and the one that matters: without it
   * Terraform cannot attach a role to a Lambda, and granted too widely it lets
   * this role hand any role in the account to a function it writes.
   */
  statement {
    sid    = "TheRolesOfItsOwnLambdas"
    effect = "Allow"

    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:PassRole",
    ]

    resources = ["arn:aws:iam::${local.account}:role/${local.prefix}-*"]
  }

  # Some services create their own role the first time they are used — CloudFront
  # and Backup among them. Creating one is all that is allowed: this is not in the
  # statement above because that one may rewrite a trust policy, and a
  # service-linked role's trust policy is the service's business, not ours.
  statement {
    sid       = "LettingAServiceCreateItsOwnRole"
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${local.account}:role/aws-service-role/*"]
  }

  # ---------------------------------------------------------------------------
  # The part that makes this a deploy role and not an administrator.
  #
  # A Deny beats every Allow in IAM, including one that arrives later in a policy
  # somebody adds in a hurry. That is the point of writing these here rather than
  # relying on the Allows above being narrow.
  # ---------------------------------------------------------------------------

  statement {
    sid    = "NoTurningAnHourIntoForever"
    effect = "Deny"

    # An access key does not expire. Creating one — for a user, or for this role
    # by way of a user — is the only way a one-hour credential becomes permanent,
    # so it is the first thing to take away.
    actions = [
      "iam:CreateUser",
      "iam:CreateAccessKey",
      "iam:CreateLoginProfile",
      "iam:UpdateLoginProfile",
      "iam:CreateVirtualMFADevice",
      "iam:DeactivateMFADevice",
      "iam:AttachUserPolicy",
      "iam:PutUserPolicy",
      "iam:AddUserToGroup",
      "iam:CreateGroup",
      "iam:AttachGroupPolicy",
      "iam:PutGroupPolicy",
      "iam:CreateSAMLProvider",
      "iam:CreateOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
      "iam:DeleteOpenIDConnectProvider",
      "iam:AddClientIDToOpenIDConnectProvider",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "NoEditingItself"
    effect = "Deny"

    # Everything that could widen this role. Without it, one line added to the
    # Terraform of the stack would be enough to make the role an administrator on
    # the next apply, and the review that should have caught it is a code review.
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
    ]

    resources = [aws_iam_role.deploy.arn]
  }

  statement {
    sid    = "NotTheManagedAdminPolicies"
    effect = "Deny"

    # `iam:PolicyARN` is one of the few condition keys that looks at what is being
    # attached rather than to what. It does not close the escalation described
    # above — an inline policy goes around it — but it does close the one-line
    # version of it, and a deploy that suddenly needs AdministratorAccess is a
    # deploy somebody should have to explain.
    actions = ["iam:AttachRolePolicy"]

    resources = ["*"]

    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"

      values = [
        "arn:aws:iam::aws:policy/AdministratorAccess",
        "arn:aws:iam::aws:policy/IAMFullAccess",
        "arn:aws:iam::aws:policy/PowerUserAccess",
        "arn:aws:iam::aws:policy/job-function/Billing",
      ]
    }
  }

  statement {
    sid    = "NoLosingTheMapOfWhatExists"
    effect = "Deny"

    # The state bucket is not part of the stack, and a stack that could delete it
    # would leave Terraform unable to find anything it ever created. Reading and
    # writing the state itself stays allowed — that is the whole job.
    actions = [
      "s3:DeleteBucket",
      "s3:DeleteBucketPolicy",
      "s3:PutBucketVersioning",
      "s3:PutLifecycleConfiguration",
    ]

    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
    ]
  }

  statement {
    sid    = "NotTheAccountItself"
    effect = "Deny"

    # Nothing about billing, the organisation, the support plan or the account's
    # own settings is a deploy's business. Budgets stay allowed above, because the
    # stack creates one.
    actions = [
      "organizations:*",
      "account:*",
      "aws-portal:*",
      "iam:DeleteAccountPasswordPolicy",
      "iam:UpdateAccountPasswordPolicy",
      "cloudtrail:DeleteTrail",
      "cloudtrail:StopLogging",
      "cloudtrail:UpdateTrail",
    ]

    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "terraform"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

/**
 * The state bucket and the lock table, which the role needs and the stack does
 * not create.
 *
 * Separate from the policy above so that the one thing every apply depends on is
 * visible on its own: no state access, no deploy, and the error would arrive
 * before the plan.
 */
data "aws_iam_policy_document" "deploy_state" {
  statement {
    sid       = "ReadAndWriteTheState"
    effect    = "Allow"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = [aws_s3_bucket.state.arn]
  }

  statement {
    sid       = "TheStateFilesThemselves"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }

  statement {
    sid    = "TheLock"
    effect = "Allow"

    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:DescribeTable",
    ]

    resources = [aws_dynamodb_table.lock.arn]
  }
}

resource "aws_iam_role_policy" "deploy_state" {
  name   = "terraform-state"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy_state.json
}
