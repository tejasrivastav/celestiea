output "ui_bucket" {
  description = "Bucket the built UI is synced to."
  value       = aws_s3_bucket.ui.bucket
}

output "distribution_id" {
  description = "CloudFront distribution ID, for invalidating /index.html."
  value       = aws_cloudfront_distribution.this.id
}

output "url" {
  description = "Public URL of the shop."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}
