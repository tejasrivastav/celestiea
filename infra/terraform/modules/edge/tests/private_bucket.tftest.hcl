mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
  mock_resource "aws_cloudfront_distribution" {
    defaults = { arn = "arn:aws:cloudfront::123456789012:distribution/TEST" }
  }
}

variables {
  name       = "test"
  api_domain = "example.execute-api.eu-central-1.amazonaws.com"
}

run "ui_bucket_is_reachable_only_through_cloudfront" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.ui.block_public_acls,
      aws_s3_bucket_public_access_block.ui.block_public_policy,
      aws_s3_bucket_public_access_block.ui.ignore_public_acls,
      aws_s3_bucket_public_access_block.ui.restrict_public_buckets,
    ])
    error_message = "The UI bucket must block all public access."
  }

  assert {
    condition     = aws_cloudfront_origin_access_control.ui.signing_behavior == "always"
    error_message = "CloudFront must sign every request to the UI bucket."
  }

  assert {
    condition     = aws_cloudfront_distribution.this.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "The UI must be served over HTTPS only."
  }
}
