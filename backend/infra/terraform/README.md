# GCP infrastructure

This directory is the version-controlled source of truth for the devotional movie backend's
Google Cloud topology. It describes the existing staging project as well as the production-safe
switches. Secret containers and IAM are managed here; secret payloads are never placed in source
or Terraform variables/state.

Managed topology:

- required project APIs;
- Artifact Registry Docker repository;
- runtime and Cloud Tasks OIDC service accounts plus least-privilege IAM;
- private GCS movie bucket, public-access prevention, soft delete, and input/final/provider-raw lifecycle;
- Firestore Native database and the `devotionalMovieAttempts.expiresAt` TTL policy;
- one throttled, retrying Cloud Tasks queue;
- Firebase project, anonymous Firebase Authentication with automatic cleanup after 30 days, iOS App Attest, and Web App reCAPTCHA Enterprise App Check configuration;
- Vertex AI runtime access plus Gemini developer-API and fal.ai Secret Manager containers;
- one public-ingress Cloud Run service whose mobile routes enforce Firebase ID token plus App
  Check and whose internal route independently enforces the Cloud Tasks OIDC identity;
- optional exact-origin browser CORS on Cloud Run and read-only signed-object access in GCS;
- optional monthly Billing Budget alerts. GCP budgets alert but do not cap spend; the backend's
  India-calendar-day Firestore transaction is the hard paid-video control.

## First adoption of the existing staging resources

Terraform state is intentionally ignored. Configure an encrypted remote state backend for team
use; for a one-owner local adoption, copy `staging.tfvars.example` to `terraform.tfvars`, run
`terraform init`, and import the resources before the first plan. Importing is required because
these resources already exist and were initially created with `gcloud`.

Representative import IDs:

```sh
terraform import google_firebase_project.current project-d5db8f30-7db5-4b54-925
terraform import google_firebase_web_app.web projects/project-d5db8f30-7db5-4b54-925/webApps/1:378578536975:web:397d379ea60638dca6317a
terraform import google_recaptcha_enterprise_key.web projects/project-d5db8f30-7db5-4b54-925/keys/6LdkP6ktAAAAAJpc9WUk74ApfO3K0HzFaIV9lSBp
terraform import google_firebase_app_check_recaptcha_enterprise_config.web projects/378578536975/apps/1:378578536975:web:397d379ea60638dca6317a/recaptchaEnterpriseConfig
terraform import google_artifact_registry_repository.backend projects/project-d5db8f30-7db5-4b54-925/locations/asia-south1/repositories/devotional-movies
terraform import google_service_account.runtime projects/project-d5db8f30-7db5-4b54-925/serviceAccounts/devotional-movie-runtime@project-d5db8f30-7db5-4b54-925.iam.gserviceaccount.com
terraform import google_service_account.task_caller projects/project-d5db8f30-7db5-4b54-925/serviceAccounts/devotional-movie-task-caller@project-d5db8f30-7db5-4b54-925.iam.gserviceaccount.com
terraform import google_storage_bucket.movies project-d5db8f30-7db5-4b54-925-devotional-movies
terraform import google_firestore_database.default projects/project-d5db8f30-7db5-4b54-925/databases/\(default\)
terraform import google_firestore_field.attempt_expiry projects/project-d5db8f30-7db5-4b54-925/databases/\(default\)/collectionGroups/devotionalMovieAttempts/fields/expiresAt
terraform import google_cloud_tasks_queue.generation projects/project-d5db8f30-7db5-4b54-925/locations/asia-south1/queues/devotional-movie-generation
terraform import google_secret_manager_secret.gemini projects/project-d5db8f30-7db5-4b54-925/secrets/gemini-developer-api-key
terraform import google_secret_manager_secret.fal projects/project-d5db8f30-7db5-4b54-925/secrets/fal-api-key
terraform import google_identity_platform_config.auth projects/project-d5db8f30-7db5-4b54-925/config
terraform import google_firebase_app_check_app_attest_config.ios projects/project-d5db8f30-7db5-4b54-925/apps/1:378578536975:ios:b9e5d58b210ccf9ba6317a/appAttestConfig
terraform import google_cloud_run_v2_service.backend projects/project-d5db8f30-7db5-4b54-925/locations/asia-south1/services/devotional-movies-staging
```

Import each `google_project_service.required`, IAM member, and secret/bucket IAM member using the
standard provider import IDs before applying. Run `terraform plan` until it contains only reviewed,
intentional changes. In particular, the configuration enables Firestore delete protection and
Cloud Tasks request logging, which are safe hardening changes but differ from the original manual
setup.

## Staging deploy

Build from `backend/`, obtain the immutable digest, update `container_image`, then plan and apply:

```sh
gcloud builds submit --config cloudbuild.yaml --substitutions=_IMAGE_TAG=staging .
gcloud artifacts docker images describe asia-south1-docker.pkg.dev/project-d5db8f30-7db5-4b54-925/devotional-movies/devotional-backend:staging --format='value(image_summary.digest)'
terraform plan -out=staging.tfplan
terraform apply staging.tfplan
```

Keep `environment=staging-fake` and `enable_billable_generation=false` for the non-billable tracer
bullet. Production requires a separate reviewed environment, an immutable image digest,
`environment=production`, an explicitly selected provider/profile, the backend's daily ceiling,
and `enable_billable_generation=true`. Add secret versions out of band, for example with `gcloud
secrets versions add ... --data-file=-`; never put payloads in `.tfvars`.

For web access, set `firebase_app_ids` to both the existing iOS App ID and the registered Firebase
Web App ID, then set `web_allowed_origins` to exact deployed and local-development origins. The
same origin list configures Cloud Run responses and read-only GCS CORS. Empty lists preserve the
native-only deployment. `FIREBASE_APP_ID` remains present in Cloud Run for rollback compatibility,
while current revisions prefer the generated comma-separated `FIREBASE_APP_IDS` value. Do not use
wildcards. `../gcs-cors.web.example.json` is the equivalent documented policy for buckets that
are not managed by this Terraform state.
