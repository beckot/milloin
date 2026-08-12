locals {
  required_services = toset([
    "artifactregistry.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sts.googleapis.com",
  ])

  secret_ids = toset([
    "google-client-id",
    "google-client-secret",
    "milloin-owner-api-key",
    "milloin-session-secret",
  ])
}

data "google_project" "current" {
  project_id = var.project_id
}

resource "google_project_service" "required" {
  for_each = local.required_services

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_artifact_registry_repository" "app" {
  project       = var.project_id
  location      = var.region
  repository_id = var.service_name
  description   = "Docker images for the milloin personal scheduling service"
  format        = "DOCKER"

  depends_on = [google_project_service.required]
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = "${var.service_name}-runtime"
  display_name = "milloin Cloud Run runtime"
}

resource "google_project_iam_member" "runtime_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "app" {
  for_each = local.secret_ids

  project             = var.project_id
  secret_id           = each.value
  deletion_protection = true

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "runtime_access" {
  for_each = google_secret_manager_secret.app

  project   = var.project_id
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.runtime.email}"
}

resource "google_cloud_run_v2_service" "app" {
  project             = var.project_id
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = true

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.max_instances
    }

    containers {
      image = var.bootstrap_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = true
      }
    }
  }

  lifecycle {
    # Application releases are managed by the deployment pipeline after bootstrap.
    ignore_changes = [template[0].containers[0].image]
  }

  depends_on = [
    google_artifact_registry_repository.app,
    google_firestore_database.default,
    google_project_service.required,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = google_cloud_run_v2_service.app.location
  name     = google_cloud_run_v2_service.app.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
