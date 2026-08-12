variable "project_id" {
  description = "Existing Google Cloud project ID for the milloin production instance. Project creation/billing stays outside this module because project IDs are globally unique and billing-account access is user-specific."
  type        = string
}

variable "region" {
  description = "Primary region for Cloud Run, Artifact Registry and Firestore."
  type        = string
  default     = "europe-north1"
}

variable "service_name" {
  description = "Cloud Run service and resource name prefix."
  type        = string
  default     = "milloin"
}

variable "bootstrap_image" {
  description = "Known-good image used only to create the Cloud Run service before the application deployment pipeline publishes the real image."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "max_instances" {
  description = "Hard Cloud Run scale ceiling for this personal service."
  type        = number
  default     = 3

  validation {
    condition     = var.max_instances >= 1 && var.max_instances <= 20
    error_message = "max_instances must be between 1 and 20."
  }
}
