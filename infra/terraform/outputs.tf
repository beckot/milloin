output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "cloud_run_service" {
  value = google_cloud_run_v2_service.app.name
}

output "cloud_run_url" {
  value = google_cloud_run_v2_service.app.uri
}

output "artifact_registry_repository" {
  value = google_artifact_registry_repository.app.id
}

output "artifact_registry_image_prefix" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app.repository_id}"
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "deployment_service_account" {
  value = google_service_account.deploy.email
}

output "github_workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "secret_names" {
  value = { for key, secret in google_secret_manager_secret.app : key => secret.id }
}
