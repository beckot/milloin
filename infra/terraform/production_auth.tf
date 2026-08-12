# The deployment workflow resolves enabled Secret Manager version numbers so
# each Cloud Run revision can pin immutable secret references. This role can
# view secret metadata/version state but cannot read secret payloads.
resource "google_project_iam_member" "deploy_secret_viewer" {
  project = var.project_id
  role    = "roles/secretmanager.viewer"
  member  = "serviceAccount:${google_service_account.deploy.email}"
}
