variable "project_id" { type = string }
variable "env" { type = string }
variable "secret_ids" { type = set(string) }

resource "google_secret_manager_secret" "this" {
  for_each  = var.secret_ids
  project   = var.project_id
  secret_id = each.value

  replication {
    auto {}
  }

  labels = {
    app        = "noah-platform"
    env        = var.env
    managed_by = "terraform"
  }
}
