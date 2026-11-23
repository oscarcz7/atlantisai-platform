terraform {
  required_version = ">= 1.6.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  backend "gcs" {
    # Configure via -backend-config="bucket=<ops-project>-tfstate"
    prefix = "noah/stg"
  }
}

variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-east1"
}
variable "api_image" { type = string }
variable "web_image" { type = string }

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_artifact_registry_repository" "noah" {
  location      = var.region
  repository_id = "noah"
  format        = "DOCKER"

  labels = {
    app        = "noah-platform"
    env        = "stg"
    managed_by = "terraform"
  }
}

resource "google_service_account" "api_runtime" {
  account_id   = "api-runtime"
  display_name = "NOAH API Runtime (stg)"
}

resource "google_service_account" "web_runtime" {
  account_id   = "web-runtime"
  display_name = "NOAH Web Runtime (stg)"
}

resource "google_project_iam_member" "api_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

module "db" {
  source      = "../../modules/cloud-sql"
  project_id  = var.project_id
  region      = var.region
  env         = "stg"
  tier        = "db-f1-micro"
  enable_pitr = false
}

module "storage" {
  source     = "../../modules/storage"
  project_id = var.project_id
  region     = var.region
  env        = "stg"
}

module "secrets" {
  source     = "../../modules/secrets"
  project_id = var.project_id
  env        = "stg"
  secret_ids = ["DATABASE_URL", "DATABASE_MIGRATION_URL", "JWT_SECRET", "FIELD_ENCRYPTION_KEY", "SENTRY_DSN"]
}

module "api" {
  source                   = "../../modules/cloud-run-service"
  project_id               = var.project_id
  region                   = var.region
  env                      = "stg"
  name                     = "noah-api"
  image                    = var.api_image
  service_account_email    = google_service_account.api_runtime.email
  min_instances            = 0
  cpu_always_allocated     = false
  cloudsql_connection_name = module.db.connection_name
  health_path              = "/health"
}

module "web" {
  source                = "../../modules/cloud-run-service"
  project_id            = var.project_id
  region                = var.region
  env                   = "stg"
  name                  = "noah-web"
  image                 = var.web_image
  service_account_email = google_service_account.web_runtime.email
  min_instances         = 0
  health_path           = "/api/health"
}

output "api_url" { value = module.api.uri }
output "web_url" { value = module.web.uri }
