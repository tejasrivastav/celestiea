# The bucket name contains the account ID and is passed at init time:
#   terraform init -backend-config="bucket=$(terraform -chdir=../../bootstrap output -raw state_bucket)"
terraform {
  backend "s3" {
    key          = "envs/dev/terraform.tfstate"
    region       = "eu-central-1"
    encrypt      = true
    use_lockfile = true
  }
}
