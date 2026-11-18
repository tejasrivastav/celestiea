mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{}" }
  }
}
mock_provider "random" {}

variables {
  name              = "test"
  subnet_ids        = ["subnet-a", "subnet-b"]
  security_group_id = "sg-db"
}

run "database_is_private_and_encrypted" {
  command = plan

  assert {
    condition     = aws_db_instance.this.publicly_accessible == false && aws_db_instance.this.storage_encrypted
    error_message = "The database must be private and encrypted."
  }

  assert {
    condition     = aws_db_instance.this.iam_database_authentication_enabled
    error_message = "IAM authentication must be on: the write Lambda has no database password."
  }
}
