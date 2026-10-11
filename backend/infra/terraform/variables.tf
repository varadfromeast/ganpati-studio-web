variable "project_id" {
  description = "Existing Firebase/GCP project used for this environment."
  type        = string
}

variable "region" {
  description = "Single region for Cloud Run, Cloud Tasks, Firestore, GCS, and Artifact Registry."
  type        = string
  default     = "asia-south1"
}

variable "environment" {
  description = "Backend runtime mode. Keep staging on staging-fake until billable generation is approved."
  type        = string
  default     = "staging-fake"

  validation {
    condition     = contains(["staging-fake", "production"], var.environment)
    error_message = "environment must be staging-fake or production."
  }
}

variable "service_name" {
  type    = string
  default = "devotional-movies-staging"
}

variable "service_base_url" {
  description = "Canonical Cloud Run HTTPS origin; also used as the exact Cloud Tasks OIDC audience."
  type        = string

  validation {
    condition     = startswith(var.service_base_url, "https://")
    error_message = "service_base_url must be an HTTPS origin."
  }
}

variable "container_image" {
  description = "Immutable Artifact Registry image URL, preferably pinned by sha256 digest."
  type        = string

  validation {
    condition     = strcontains(var.container_image, "@sha256:")
    error_message = "Pin container_image to an immutable @sha256 digest."
  }
}

variable "firebase_ios_app_id" {
  type = string
}

variable "firebase_app_ids" {
  description = "Firebase App Check app IDs accepted by public API routes. Empty keeps the iOS-only legacy value."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for app_id in var.firebase_app_ids : trimspace(app_id) != "" && !strcontains(app_id, ",")
    ])
    error_message = "firebase_app_ids must contain non-empty individual app IDs without commas."
  }
}

variable "web_allowed_origins" {
  description = "Exact browser origins allowed by Cloud Run and read-only GCS CORS. Never use a wildcard."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for origin in var.web_allowed_origins :
      trimspace(origin) == origin && !strcontains(origin, ",") &&
      (can(regex("^https://[^/?#]+$", origin)) ||
      can(regex("^http://localhost(?::[0-9]+)?$", origin)))
    ])
    error_message = "web_allowed_origins must be exact HTTPS origins (or an explicit localhost development origin), without whitespace or wildcards."
  }
}

variable "firebase_bundle_id" {
  type    = string
  default = "com.varad.ganpatistudio"
}

variable "movie_bucket_name" {
  type = string
}

variable "artifact_repository_name" {
  type    = string
  default = "devotional-movies"
}

variable "task_queue_name" {
  type    = string
  default = "devotional-movie-generation"
}

variable "max_paid_video_submissions_per_india_day" {
  description = "Request-time hard ceiling. This is enforced transactionally by the backend."
  type        = number
  default     = 1

  validation {
    condition     = var.max_paid_video_submissions_per_india_day >= 1
    error_message = "The paid-video ceiling must be at least one."
  }
}

variable "enable_billable_generation" {
  description = "Attaches provider secrets and unlocks production mode. Must remain false for staging-fake."
  type        = bool
  default     = false

  validation {
    condition     = !var.enable_billable_generation || var.environment == "production"
    error_message = "Billable generation may be enabled only with environment=production."
  }
}

variable "video_generation_provider" {
  type    = string
  default = "fal"

  validation {
    condition     = var.video_generation_provider == "fal"
    error_message = "Production video generation must use fal; synchronous Gemini submission is not crash-safe."
  }
}

variable "structured_model_provider" {
  description = "Structured policy/narrative adapter. Vertex uses the runtime identity; developer-api requires GEMINI_API_KEY."
  type        = string
  default     = "vertex"

  validation {
    condition     = contains(["vertex", "developer-api"], var.structured_model_provider)
    error_message = "structured_model_provider must be vertex or developer-api."
  }
}

variable "vertex_location" {
  description = "Vertex AI endpoint location for structured policy and narrative calls."
  type        = string
  default     = "global"
}

variable "fal_video_profile_version" {
  description = "Version from backend/src/model/falVideoProfiles.ts when provider=fal."
  type        = string
  default     = "gemini-text-fal-ltx-preview-cheap-v1"
}

variable "fal_media_allowed_hosts" {
  description = "Exact HTTPS hostnames accepted for fal result downloads. Keep synchronized with verified fal response evidence."
  type        = list(string)
  default     = ["v3.fal.media", "v3b.fal.media"]

  validation {
    condition = length(var.fal_media_allowed_hosts) > 0 && alltrue([
      for host in var.fal_media_allowed_hosts :
      host == lower(trimspace(host)) && can(regex("^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$", host))
    ])
    error_message = "fal_media_allowed_hosts must contain exact lowercase hostnames, not URLs or wildcards."
  }
}

variable "manage_billing_budget" {
  description = "Create a monthly alerting budget. This alerts only; the backend daily guard is the hard control."
  type        = bool
  default     = false
}

variable "billing_account_id" {
  description = "Billing account ID without the billingAccounts/ prefix. Required only for budget management."
  type        = string
  default     = ""
}

variable "monthly_budget_inr" {
  description = "Monthly GCP alerting budget in INR. It is not a spend cap."
  type        = number
  default     = 3100
}
