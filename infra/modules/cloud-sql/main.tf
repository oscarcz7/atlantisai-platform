variable "project_id" { type = string }
variable "region" { type = string }
variable "env" { type = string }
variable "tier" { type = string }
variable "enable_pitr" {
  type    = bool
  default = false
}

resource "google_sql_database_instance" "this" {
  name             = "noah-pg-${var.env}"
  project          = var.project_id
  region           = var.region
  database_version = "POSTGRES_16"

  settings {
    tier = var.tier

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.enable_pitr
      transaction_log_retention_days = var.enable_pitr ? 7 : 1
    }

    user_labels = {
      app        = "noah-platform"
      env        = var.env
      managed_by = "terraform"
    }
  }

  deletion_protection = var.env == "prd"
}

resource "google_sql_database" "noah" {
  name     = "noah"
  project  = var.project_id
  instance = google_sql_database_instance.this.name
}

output "connection_name" {
  value = google_sql_database_instance.this.connection_name
}
