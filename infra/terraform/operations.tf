locals {
  create_budget = var.billing_account_id != null && var.budget_currency_code != null
  service_host  = trimprefix(google_cloud_run_v2_service.app.uri, "https://")
}

# Scheduling-poll data is small and low-churn. A weekly backup retained for
# eight weeks gives useful recovery points without creating daily copies for a
# personal utility.
resource "google_firestore_backup_schedule" "weekly" {
  project  = var.project_id
  database = google_firestore_database.default.name

  retention       = var.firestore_backup_retention
  deletion_policy = "ABANDON"

  weekly_recurrence {
    day = "SUNDAY"
  }

  depends_on = [google_project_service.required]
}

resource "google_monitoring_uptime_check_config" "health" {
  project            = var.project_id
  display_name       = "${var.service_name} health"
  period             = "300s"
  timeout            = "10s"
  log_check_failures = true

  http_check {
    path         = "/api/health"
    port         = "443"
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = local.service_host
    }
  }

  content_matchers {
    content = "\"ok\":true"
    matcher = "CONTAINS_STRING"
  }

  depends_on = [
    google_cloud_run_v2_service_iam_member.public,
    google_project_service.required,
  ]
}

resource "google_monitoring_notification_channel" "operator_email" {
  count = var.operator_email == null ? 0 : 1

  project      = var.project_id
  display_name = "${var.service_name} operator email"
  type         = "email"

  labels = {
    email_address = var.operator_email
  }

  depends_on = [google_project_service.required]
}

resource "google_monitoring_alert_policy" "uptime_failure" {
  project      = var.project_id
  display_name = "${var.service_name} unavailable"
  combiner     = "OR"
  severity     = "WARNING"
  enabled      = true

  notification_channels = var.operator_email == null ? [] : [google_monitoring_notification_channel.operator_email[0].name]

  documentation {
    content   = "The public milloin health endpoint has failed. Check the latest Cloud Run revision and logs before changing traffic."
    mime_type = "text/markdown"
  }

  conditions {
    display_name = "Uptime check failures"

    condition_threshold {
      filter = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\" AND resource.type=\"uptime_url\""

      comparison      = "COMPARISON_GT"
      duration        = "60s"
      threshold_value = 1

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }

  depends_on = [google_project_service.required]
}

# Billing-account configuration is deliberately optional because billing
# account IDs and currencies are user-specific. When supplied, this creates a
# project-scoped monthly budget with current and forecast thresholds. Google
# sends notifications to eligible project-level recipients.
resource "google_billing_budget" "personal_service" {
  count = local.create_budget ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "${var.service_name} personal service"

  budget_filter {
    projects        = ["projects/${data.google_project.current.number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency_code
      units         = tostring(var.monthly_budget_units)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    enable_project_level_recipients = true
  }

  depends_on = [google_project_service.required]
}
