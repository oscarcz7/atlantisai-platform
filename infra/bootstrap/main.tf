terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

variable "ops_project_id" {
  type = string
}

variable "github_repository" {
  type        = string
  description = "GitHub repository in owner/repo format"
}

variable "github_repository_owner_id" {
  type        = string
  description = "Numeric GitHub owner ID (immutable; protects against repo rename/re-creation). Empty to skip."
  default     = ""
}

variable "region" {
  type    = string
  default = "us-east1"
}

provider "google" {
  project = var.ops_project_id
  region  = var.region
}

resource "google_storage_bucket" "tf_state" {
  name                        = "${var.ops_project_id}-tfstate"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  labels = {
    app        = "noah-platform"
    env        = "ops"
    managed_by = "terraform"
  }
}

# Staging deployer (kept with its original ID so existing role grants keep working).
resource "google_service_account" "deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions Deployer (staging)"
}

# Production deployer: only reachable from the protected `production` environment on v* tags.
# Grant it run.developer / artifactregistry.writer / iam.serviceAccountUser on the PRD project only.
resource "google_service_account" "deployer_prd" {
  account_id   = "github-deployer-prd"
  display_name = "GitHub Actions Deployer (production)"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions Pool"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
    "attribute.environment"         = "assertion.environment"
    "attribute.ref"                 = "assertion.ref"
  }

  # Only the repo's protected GitHub environments may obtain credentials:
  #  - staging:    push to main
  #  - production: v* tags (environment `production` must require reviewers in GitHub)
  # Any other branch/workflow (e.g. a feature branch with a custom workflow) is rejected.
  attribute_condition = join(" && ", compact([
    "assertion.repository == '${var.github_repository}'",
    var.github_repository_owner_id != "" ? "assertion.repository_owner_id == '${var.github_repository_owner_id}'" : "",
    "((assertion.environment == 'staging' && assertion.ref == 'refs/heads/main') || (assertion.environment == 'production' && assertion.ref.startsWith('refs/tags/v')))",
  ]))

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "wif_binding" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.environment/staging"
}

resource "google_service_account_iam_member" "wif_binding_prd" {
  service_account_id = google_service_account.deployer_prd.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.environment/production"
}

output "tf_state_bucket" {
  value = google_storage_bucket.tf_state.name
}

output "wif_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  value = google_service_account.deployer.email
}

output "deployer_service_account_prd" {
  value = google_service_account.deployer_prd.email
}
