output "project_number" {
  value = data.google_project.current.number
}

output "service_url" {
  value = google_cloud_run_v2_service.backend.uri
}

output "runtime_service_account" {
  value = google_service_account.runtime.email
}

output "task_caller_service_account" {
  value = google_service_account.task_caller.email
}

output "movie_bucket" {
  value = google_storage_bucket.movies.url
}

output "task_queue" {
  value = google_cloud_tasks_queue.generation.id
}

output "artifact_repository" {
  value = google_artifact_registry_repository.backend.name
}

output "firebase_web_app_id" {
  value = google_firebase_web_app.web.app_id
}

output "firebase_web_app_check_site_key" {
  description = "Public reCAPTCHA Enterprise site key used by Firebase App Check."
  value       = google_recaptcha_enterprise_key.web.name
}
