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

variable "github_repository" {
  description = "Exact GitHub owner/repository allowed to impersonate the deployment service account via OIDC."
  type        = string
  default     = "beckot/milloin"
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

variable "operator_email" {
  description = "Optional email notification channel for uptime incidents. Leave null until the production operator address is chosen."
  type        = string
  default     = null
  nullable    = true
}

variable "firestore_backup_retention" {
  description = "Retention for the weekly Firestore backup schedule. Google supports up to 14 weeks."
  type        = string
  default     = "4838400s"
}

variable "billing_account_id" {
  description = "Optional Cloud Billing account ID. A project-scoped budget is created only when this and budget_currency_code are set."
  type        = string
  default     = null
  nullable    = true
}

variable "budget_currency_code" {
  description = "Optional billing-account currency (ISO 4217). Must match the billing account; intentionally has no guessed default."
  type        = string
  default     = null
  nullable    = true
}

variable "monthly_budget_units" {
  description = "Whole currency units for the optional monthly project budget."
  type        = number
  default     = 10

  validation {
    condition     = var.monthly_budget_units >= 1
    error_message = "monthly_budget_units must be at least 1."
  }
}
