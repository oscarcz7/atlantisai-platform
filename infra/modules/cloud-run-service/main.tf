variable "project_id" { type = string }
variable "region" { type = string }
variable "env" { type = string }
variable "name" { type = string }
variable "image" { type = string }
variable "service_account_email" { type = string }
variable "min_instances" { type = number }
variable "cpu_always_allocated" {
  type    = bool
  default = false
}
variable "cloudsql_connection_name" {
  type    = string
  default = ""
}
variable "health_path" {
  type    = string
  default = "/health"
}

resource "google_cloud_run_v2_service" "this" {
  name     = var.name
  location = var.region
  project  = var.project_id

  labels = {
    app        = "noah-platform"
    env        = var.env
    managed_by = "terraform"
  }

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = 5
    }

    dynamic "volumes" {
      for_each = var.cloudsql_connection_name != "" ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.cloudsql_connection_name]
        }
      }
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = !var.cpu_always_allocated
      }

      startup_probe {
        http_get {
          path = var.health_path
        }
      }

      dynamic "volume_mounts" {
        for_each = var.cloudsql_connection_name != "" ? [1] : []
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }
  }
}

output "uri" {
  value = google_cloud_run_v2_service.this.uri
}
