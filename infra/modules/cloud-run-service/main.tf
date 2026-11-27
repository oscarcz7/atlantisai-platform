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
variable "container_port" {
  type    = number
  default = 8080
}
variable "env_vars" {
  type    = map(string)
  default = {}
}
variable "secret_env_vars" {
  type    = map(string)
  default = {}
}
variable "allow_unauthenticated" {
  type    = bool
  default = true
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

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = !var.cpu_always_allocated
      }

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env_vars
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
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

resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "uri" {
  value = google_cloud_run_v2_service.this.uri
}
