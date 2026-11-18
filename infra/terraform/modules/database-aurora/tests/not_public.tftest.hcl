# Plan-time checks with a mocked provider: no AWS credentials needed.
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
}
mock_provider "random" {}

variables {
  name                    = "test"
  subnet_ids              = ["subnet-a", "subnet-b"]
  security_group_id       = "sg-db"
  proxy_security_group_id = "sg-proxy"
}

run "database_is_private_and_encrypted" {
  command = plan

  assert {
    condition     = alltrue([for instance in aws_rds_cluster_instance.this : instance.publicly_accessible == false])
    error_message = "Aurora instances must not be publicly accessible."
  }

  assert {
    condition     = aws_rds_cluster.this.storage_encrypted
    error_message = "Aurora storage must be encrypted."
  }

  assert {
    condition     = aws_db_proxy.this.require_tls && one(aws_db_proxy.this.auth).iam_auth == "REQUIRED"
    error_message = "RDS Proxy must require TLS and IAM authentication."
  }
}
