# One-time setup per AWS account, applied from a laptop with admin credentials. It keeps
# local state on purpose: it creates the bucket every other root stores its state in.
# Deploys run from a laptop (make deploy). CI deploys would add a GitHub OIDC provider and
# roles here; this account's organization policy denies creating OIDC providers.
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
      # Each tag holds an arm64 and an amd64 image (about 150 MB each). Five tags per
      # service slightly exceed the 500 MB free tier, which costs a few cents a month.
      description = "Keep the last 5 images"
      selection   = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action      = { type = "expire" }
    }]
  })
}
