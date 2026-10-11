data "google_project" "current" {
  project_id = var.project_id
}

locals {
  runtime_account_id     = "devotional-movie-runtime"
  task_caller_account_id = "devotional-movie-task-caller"
  runtime_member         = "serviceAccount:${google_service_account.runtime.email}"

  required_apis = toset([
    "artifactregistry.googleapis.com",
    "aiplatform.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudtasks.googleapis.com",
    "firebase.googleapis.com",
    "firebaseappcheck.googleapis.com",
    "firestore.googleapis.com",
    "generativelanguage.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "recaptchaenterprise.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
  ])

  runtime_project_roles = toset([
    "roles/aiplatform.user",
    "roles/cloudtasks.enqueuer",
    "roles/datastore.user",
    "roles/firebaseauth.viewer",
  ])
}

resource "google_project_service" "required" {
  for_each = local.required_apis

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_firebase_project" "current" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.required["firebase.googleapis.com"]]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_firebase_web_app" "web" {
  provider        = google-beta
  project         = var.project_id
  display_name    = "Ganpati Studio Web"
  deletion_policy = "ABANDON"

  depends_on = [google_firebase_project.current]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_recaptcha_enterprise_key" "web" {
  project         = var.project_id
  display_name    = "Ganpati Studio Web App Check"
  deletion_policy = "PREVENT"

  web_settings {
    integration_type  = "SCORE"
    allow_all_domains = false
    allowed_domains = [
      "${var.project_id}.web.app",
      "${var.project_id}.firebaseapp.com",
    ]
  }

  depends_on = [google_project_service.required["recaptchaenterprise.googleapis.com"]]
}

resource "google_firebase_app_check_recaptcha_enterprise_config" "web" {
  provider  = google-beta
  project   = var.project_id
  app_id    = google_firebase_web_app.web.app_id
  site_key  = google_recaptcha_enterprise_key.web.name
  token_ttl = "86400s"

  depends_on = [google_project_service.required["firebaseappcheck.googleapis.com"]]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_artifact_registry_repository" "backend" {
  project       = var.project_id
  location      = var.region
  repository_id = var.artifact_repository_name
  description   = "Private container images for the devotional movie backend"
  format        = "DOCKER"

  depends_on = [google_project_service.required["artifactregistry.googleapis.com"]]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = local.runtime_account_id
  display_name = "Devotional movie backend runtime"
  description  = "Least-privilege Cloud Run identity for durable movie creation."
}

resource "google_service_account" "task_caller" {
  project      = var.project_id
  account_id   = local.task_caller_account_id
  display_name = "Devotional movie Cloud Tasks caller"
  description  = "OIDC identity accepted only by the backend's internal worker route."
}

resource "google_project_iam_member" "runtime" {
  for_each = local.runtime_project_roles

  project = var.project_id
  role    = each.value
  member  = local.runtime_member
}

resource "google_service_account_iam_member" "runtime_can_mint_its_signing_token" {
  service_account_id = google_service_account.runtime.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = local.runtime_member
}

resource "google_service_account_iam_member" "runtime_can_act_as_task_caller" {
  service_account_id = google_service_account.task_caller.name
  role               = "roles/iam.serviceAccountUser"
  member             = local.runtime_member
}

resource "google_storage_bucket" "movies" {
  project                     = var.project_id
  name                        = var.movie_bucket_name
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  dynamic "cors" {
    for_each = length(var.web_allowed_origins) == 0 ? [] : [1]
    content {
      origin = var.web_allowed_origins
      method = ["GET", "HEAD"]
      response_header = [
        "Accept-Ranges",
        "Cache-Control",
        "Content-Length",
        "Content-Range",
        "Content-Type",
        "ETag",
        "Range",
      ]
      max_age_seconds = 3600
    }
  }

  lifecycle_rule {
    action { type = "Delete" }
    condition {
      age            = 1
      matches_prefix = ["inputs/"]
    }
  }

  lifecycle_rule {
    action { type = "Delete" }
    condition {
      age            = 7
      matches_prefix = ["movies/"]
    }
  }

  lifecycle_rule {
    action { type = "Delete" }
    condition {
      age            = 7
      matches_prefix = ["provider-raw/"]
    }
  }

  depends_on = [google_project_service.required["storage.googleapis.com"]]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket_iam_member" "runtime_objects" {
  bucket = google_storage_bucket.movies.name
  role   = "roles/storage.objectAdmin"
  member = local.runtime_member
}

resource "google_firestore_database" "default" {
  project                     = var.project_id
  name                        = "(default)"
  location_id                 = var.region
  type                        = "FIRESTORE_NATIVE"
  concurrency_mode            = "PESSIMISTIC"
  app_engine_integration_mode = "DISABLED"
  delete_protection_state     = "DELETE_PROTECTION_ENABLED"
  deletion_policy             = "ABANDON"

  depends_on = [google_project_service.required["firestore.googleapis.com"]]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_firestore_field" "attempt_expiry" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "devotionalMovieAttempts"
  field      = "expiresAt"

  ttl_config {}
}

resource "google_cloud_tasks_queue" "generation" {
  project  = var.project_id
  name     = var.task_queue_name
  location = var.region

  rate_limits {
    max_concurrent_dispatches = 1
    max_dispatches_per_second = 1
  }

  retry_config {
    max_attempts       = 20
    max_retry_duration = "3600s"
    min_backoff        = "10s"
    max_backoff        = "300s"
    max_doublings      = 5
  }

  stackdriver_logging_config {
    sampling_ratio = 1
  }

  depends_on = [google_project_service.required["cloudtasks.googleapis.com"]]
}

resource "google_secret_manager_secret" "gemini" {
  project             = var.project_id
  secret_id           = "gemini-developer-api-key"
  deletion_protection = true
  version_destroy_ttl = "604800s"
  deletion_policy     = "ABANDON"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret" "fal" {
  project             = var.project_id
  secret_id           = "fal-api-key"
  deletion_protection = true
  version_destroy_ttl = "604800s"
  deletion_policy     = "ABANDON"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_iam_member" "runtime_gemini" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.gemini.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.runtime_member
}

resource "google_secret_manager_secret_iam_member" "runtime_fal" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.fal.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = local.runtime_member
}

resource "google_identity_platform_config" "auth" {
  provider = google-beta
  project  = var.project_id

  autodelete_anonymous_users = true

  sign_in {
    anonymous { enabled = true }
  }

  authorized_domains = [
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
  ]

  depends_on = [google_project_service.required["identitytoolkit.googleapis.com"]]

  lifecycle {
    prevent_destroy = true
  }
}

data "google_firebase_apple_app" "ios" {
  provider = google-beta
  project  = var.project_id
  app_id   = var.firebase_ios_app_id

  depends_on = [google_firebase_project.current]
}

resource "google_firebase_app_check_app_attest_config" "ios" {
  provider  = google-beta
  project   = var.project_id
  app_id    = data.google_firebase_apple_app.ios.app_id
  token_ttl = "3600s"

  depends_on = [google_project_service.required["firebaseappcheck.googleapis.com"]]
}

resource "google_cloud_run_v2_service" "backend" {
  project              = var.project_id
  name                 = var.service_name
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  invoker_iam_disabled = true
  deletion_protection  = true

  scaling {
    max_instance_count = 1
  }

  template {
    service_account                  = google_service_account.runtime.email
    timeout                          = "900s"
    max_instance_request_concurrency = 4

    scaling {
      max_instance_count = 1
    }

    containers {
      image = var.container_image

      ports { container_port = 8080 }

      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        failure_threshold = 1
        period_seconds    = 240
        timeout_seconds   = 240
        tcp_socket { port = 8080 }
      }

      env {
        name  = "APP_ENV"
        value = var.environment
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "CLOUD_TASKS_LOCATION"
        value = var.region
      }
      env {
        name  = "CLOUD_TASKS_QUEUE"
        value = google_cloud_tasks_queue.generation.name
      }
      env {
        name  = "SERVICE_BASE_URL"
        value = var.service_base_url
      }
      env {
        name  = "TASK_CALLER_SERVICE_ACCOUNT"
        value = google_service_account.task_caller.email
      }
      env {
        name  = "MOVIE_BUCKET"
        value = google_storage_bucket.movies.name
      }
      env {
        name  = "FIREBASE_APP_ID"
        value = var.firebase_ios_app_id
      }
      env {
        name = "FIREBASE_APP_IDS"
        value = join(",", length(var.firebase_app_ids) == 0
          ? [var.firebase_ios_app_id]
        : var.firebase_app_ids)
      }
      env {
        name  = "WEB_ALLOWED_ORIGINS"
        value = join(",", var.web_allowed_origins)
      }

      dynamic "env" {
        for_each = var.enable_billable_generation ? [1] : []
        content {
          name  = "ENABLE_BILLABLE_GENERATION"
          value = "true"
        }
      }
      dynamic "env" {
        for_each = var.enable_billable_generation ? [1] : []
        content {
          name  = "MAX_PAID_VIDEO_SUBMISSIONS_PER_INDIA_DAY"
          value = tostring(var.max_paid_video_submissions_per_india_day)
        }
      }
      dynamic "env" {
        for_each = var.enable_billable_generation ? [1] : []
        content {
          name  = "VIDEO_GENERATION_PROVIDER"
          value = var.video_generation_provider
        }
      }
      dynamic "env" {
        for_each = var.enable_billable_generation ? [1] : []
        content {
          name  = "STRUCTURED_MODEL_PROVIDER"
          value = var.structured_model_provider
        }
      }
      dynamic "env" {
        for_each = var.enable_billable_generation && var.structured_model_provider == "vertex" ? [1] : []
        content {
          name  = "VERTEX_LOCATION"
          value = var.vertex_location
        }
      }
      dynamic "env" {
        for_each = var.enable_billable_generation && var.video_generation_provider == "fal" ? [1] : []
        content {
          name  = "FAL_VIDEO_PROFILE_VERSION"
          value = var.fal_video_profile_version
        }
      }
      dynamic "env" {
        for_each = var.enable_billable_generation && var.video_generation_provider == "fal" ? [1] : []
        content {
          name  = "FAL_MEDIA_ALLOWED_HOSTS"
          value = join(",", var.fal_media_allowed_hosts)
        }
      }
      dynamic "env" {
        for_each = var.enable_billable_generation && var.structured_model_provider == "developer-api" ? [1] : []
        content {
          name = "GEMINI_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.gemini.secret_id
              version = "latest"
            }
          }
        }
      }
      dynamic "env" {
        for_each = var.enable_billable_generation && var.video_generation_provider == "fal" ? [1] : []
        content {
          name = "FAL_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.fal.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.required["run.googleapis.com"],
    google_project_iam_member.runtime,
    google_secret_manager_secret_iam_member.runtime_gemini,
    google_secret_manager_secret_iam_member.runtime_fal,
  ]

  lifecycle {
    precondition {
      condition     = var.environment == "production" || !var.enable_billable_generation
      error_message = "staging-fake must never attach billable model credentials."
    }
  }
}

resource "google_billing_budget" "monthly_alert" {
  count = var.manage_billing_budget ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "Ganpati Studio monthly GCP alert"

  amount {
    specified_amount {
      currency_code = "INR"
      units         = tostring(var.monthly_budget_inr)
    }
  }

  budget_filter {
    projects        = ["projects/${data.google_project.current.number}"]
    calendar_period = "MONTH"
  }

  threshold_rules { threshold_percent = 0.5 }
  threshold_rules { threshold_percent = 0.9 }
  threshold_rules { threshold_percent = 1.0 }

  lifecycle {
    precondition {
      condition     = !var.manage_billing_budget || var.billing_account_id != ""
      error_message = "billing_account_id is required when manage_billing_budget=true."
    }
  }
}
