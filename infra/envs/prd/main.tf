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
    prefix = "noah/prd"
  }
}

variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "us-east1"
}
variable "api_image" { type = string }
variable "web_image" { type = string }
variable "web_url" {
  type        = string
  default     = ""
  description = "Dominio propio del dashboard (ej. https://app.edificionoah.com). Si se deja vacio, usa la URL *.run.app."
}
variable "cookie_same_site" {
  type        = string
  default     = "none"
  description = "Usar 'none' mientras se opere con URLs *.run.app; cambiar a 'strict' al migrar a dominio propio."
}

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
    env        = "prd"
    managed_by = "terraform"
  }
}

resource "google_service_account" "api_runtime" {
  account_id   = "api-runtime"
  display_name = "NOAH API Runtime (prd)"
}

resource "google_service_account" "web_runtime" {
  account_id   = "web-runtime"
  display_name = "NOAH Web Runtime (prd)"
}

resource "google_project_iam_member" "api_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

resource "google_project_iam_member" "api_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api_runtime.email}"
}

module "db" {
  source      = "../../modules/cloud-sql"
  project_id  = var.project_id
  region      = var.region
  env         = "prd"
  tier        = "db-custom-1-3840"
  enable_pitr = true
}

module "storage" {
  source     = "../../modules/storage"
  project_id = var.project_id
  region     = var.region
  env        = "prd"
}

module "secrets" {
  source     = "../../modules/secrets"
  project_id = var.project_id
  env        = "prd"
  secret_ids = [
    "DATABASE_URL",
    "DATABASE_MIGRATION_URL",
    "JWT_SECRET",
    "FIELD_ENCRYPTION_KEY",
    "GATEWAY_API_TOKEN",
    "PASS_SIGNING_SECRET",
    "SENTRY_DSN",
  ]
}

module "web" {
  source                = "../../modules/cloud-run-service"
  project_id            = var.project_id
  region                = var.region
  env                   = "prd"
  name                  = "noah-web"
  image                 = var.web_image
  service_account_email = google_service_account.web_runtime.email
  min_instances         = 0
  container_port        = 3000
  health_path           = "/api/health"
}

locals {
  resolved_web_url = var.web_url != "" ? var.web_url : module.web.uri
}

module "api" {
  source                   = "../../modules/cloud-run-service"
  project_id               = var.project_id
  region                   = var.region
  env                      = "prd"
  name                     = "noah-api"
  image                    = var.api_image
  service_account_email    = google_service_account.api_runtime.email
  min_instances            = 1
  cpu_always_allocated     = true
  cloudsql_connection_name = module.db.connection_name
  container_port           = 8080
  health_path              = "/health"

  env_vars = {
    NODE_ENV                  = "production"
    APP_TIMEZONE_DEFAULT      = "America/Guayaquil"
    WEB_URL                   = local.resolved_web_url
    PUBLIC_WEB_URL            = local.resolved_web_url
    COOKIE_SAME_SITE          = var.cookie_same_site
    STORAGE_DRIVER            = "gcs"
    STORAGE_BUCKET            = module.storage.bucket_name
    MAIL_DRIVER               = "console"
    HIKVISION_EMPLOYEE_PREFIX = "NX"
    HIKVISION_CARD_DIGITS     = "10"
  }

  secret_env_vars = {
    DATABASE_URL         = "DATABASE_URL"
    JWT_SECRET           = "JWT_SECRET"
    FIELD_ENCRYPTION_KEY = "FIELD_ENCRYPTION_KEY"
    GATEWAY_API_TOKEN    = "GATEWAY_API_TOKEN"
    PASS_SIGNING_SECRET  = "PASS_SIGNING_SECRET"
    SENTRY_DSN           = "SENTRY_DSN"
  }

  depends_on = [module.secrets, google_project_iam_member.api_secrets]
}

resource "google_cloud_run_v2_job" "api_migrate" {
  name     = "noah-api-migrate"
  location = var.region
  project  = var.project_id

  labels = {
    app        = "noah-platform"
    env        = "prd"
    managed_by = "terraform"
  }

  template {
    template {
      service_account = google_service_account.api_runtime.email

      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [module.db.connection_name]
        }
      }

      containers {
        image   = var.api_image
        command = ["npx"]
        args    = ["--yes", "prisma@5.22.0", "migrate", "deploy", "--schema=prisma/schema.prisma"]

        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = "DATABASE_MIGRATION_URL"
              version = "latest"
            }
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }

  depends_on = [module.secrets, google_project_iam_member.api_secrets]
}

output "api_url" { value = module.api.uri }
output "web_url" { value = module.web.uri }
output "cloudsql_connection_name" { value = module.db.connection_name }
