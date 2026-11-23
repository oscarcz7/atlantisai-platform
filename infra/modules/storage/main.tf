variable "project_id" { type = string }
variable "region" { type = string }
variable "env" { type = string }

resource "google_storage_bucket" "files" {
  name                        = "${var.project_id}-files"
  project                     = var.project_id
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  labels = {
    app        = "noah-platform"
    env        = var.env
    managed_by = "terraform"
  }
}

output "bucket_name" {
  value = google_storage_bucket.files.name
}
