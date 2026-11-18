# One-time setup per AWS account, applied from a laptop with admin credentials. It keeps
# local state on purpose: it creates the bucket every other root stores its state in.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "celestiea", ManagedBy = "terraform", Root = "bootstrap" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  state_bucket = "celestiea-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Images are pushed by the deploy workflow before `terraform apply` of envs/dev, so the
# repositories have to exist independently of that root.
resource "aws_ecr_repository" "service" {
  for_each             = toset(["read-api", "migrator"])
  name                 = "celestiea/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each   = aws_ecr_repository.service
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 20 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 20 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  # Pull requests may only plan; applies run from the protected "dev" environment, which
  # requires a manual approval in GitHub.
  github_roles = {
    plan = {
      subject  = "repo:${var.github_repository}:pull_request"
      policies = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
    }
    deploy = {
      subject  = "repo:${var.github_repository}:environment:dev"
      policies = ["arn:aws:iam::aws:policy/AdministratorAccess"]
    }
  }
}

data "aws_iam_policy_document" "github_trust" {
  for_each = local.github_roles

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [each.value.subject]
    }
  }
}

resource "aws_iam_role" "github" {
  for_each           = local.github_roles
  name               = "celestiea-github-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.github_trust[each.key].json
}

resource "aws_iam_role_policy_attachment" "github" {
  for_each = {
    for pair in flatten([
      for role, config in local.github_roles : [
        for policy in config.policies : { key = "${role}-${basename(policy)}", role = role, policy = policy }
      ]
    ]) : pair.key => pair
  }
  role       = aws_iam_role.github[each.value.role].name
  policy_arn = each.value.policy
}

# Plans take the state lock, which writes a lock object, so the read-only role still
# needs write access to the state bucket.
data "aws_iam_policy_document" "plan_state" {
  statement {
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }
}

resource "aws_iam_role_policy" "plan_state" {
  name   = "terraform-state"
  role   = aws_iam_role.github["plan"].id
  policy = data.aws_iam_policy_document.plan_state.json
}
