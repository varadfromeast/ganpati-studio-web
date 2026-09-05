# Cheapest production-suitable GCP hosting for Ganpati Studio Web

Research date: 2026-09-04
Scope: hosting and operating the web client while preserving the existing Node/Express backend contracts and Firebase security model.
Evidence: official Google Cloud/Firebase documentation, this repository, and read-only inspection of the current GCP project. List prices are USD and exclude tax, exchange-rate effects, fal.ai, and OpenAI charges.

## Decision

Use one billing-enabled Firebase/GCP project on the pay-as-you-go **Blaze** plan, with:

- **Firebase Hosting (classic)** for the compiled static web client and immutable runtime art, on its global CDN;
- the **existing Cloud Run service** for the Express API and Cloud Tasks worker, using request-based billing, `min-instances=0`, `max-instances=1`, two vCPU, 2 GiB memory, concurrency four, and a 900-second timeout;
- **Firestore Standard**, **Cloud Tasks**, **private regional Cloud Storage**, **Secret Manager**, **Artifact Registry**, and **Cloud Build**, all already used by the backend;
- Firebase Authentication with anonymous sign-in plus automatic anonymous-account cleanup, and a new Firebase Web App protected by App Check with reCAPTCHA Enterprise;
- `asia-south1` (Mumbai) for Cloud Run, Firestore, Cloud Tasks, Artifact Registry, and the private media bucket, while retaining the Vertex AI `global` endpoint for the lowest model price.

This has no always-on server or load-balancer charge. It reuses the code and infrastructure already present, and almost every backend product remains inside a recurring no-cost allowance at launch traffic. Firebase Hosting is the likely first GCP line item if the festival launch becomes popular because the art catalog is bandwidth-heavy.

Do **not** use Firebase App Hosting, a VM, GKE, Cloud SQL, or a public Cloud Storage website plus HTTPS load balancer. The client is static, the backend is already containerized, and those alternatives add either unnecessary runtime/build resources, operational work, or fixed cost. Firebase Hosting already supplies production static hosting, CDN delivery, and SSL ([Hosting quickstart](https://firebase.google.com/docs/hosting/quickstart)).

## Recommended topology

```text
Browser
  |-- HTML, CSS, JS, runtime art --> Firebase Hosting global CDN
  |-- Firebase anonymous ID token --> Firebase Authentication
  |-- App Check token ------------> reCAPTCHA Enterprise / Firebase App Check
  `-- HTTPS API ------------------> Cloud Run, asia-south1
                                      |-- records/economy --> Firestore
                                      |-- enqueue ---------> Cloud Tasks
                                      |                       `--> same Cloud Run internal route (OIDC)
                                      |-- private bytes ----> Cloud Storage, asia-south1
                                      |                       `--> short-lived signed download URL
                                      |-- policy/text ------> Vertex AI global
                                      `-- generation -------> fal.ai / OpenAI (outside GCP estimate)
```

Call the Cloud Run `run.app` origin directly from the browser and allow only the production Hosting origins in strict CORS middleware. This is preferable to putting every API call behind a Hosting rewrite because Firebase Hosting has a hard 60-second dynamic-response timeout ([Firebase Hosting to Cloud Run](https://firebase.google.com/docs/hosting/cloud-run)); `OpenAIEnhancedStillGenerator` permits a provider request to take 120 seconds. The queued movie POST and polling routes could be proxied later, but one direct API base URL is simpler for the ten-day launch. Cloud Tasks must continue to call the stable `run.app` service URL directly.

## Why this matches the repository

- `backend/Dockerfile` already packages Node 24, FFmpeg, and Noto fonts. Cloud Run is the natural runtime; a function conversion would add risk without changing the underlying serverless compute economics.
- The public contract is already asynchronous for devotional movies: a quick `202`, durable Cloud Tasks processing, Firestore status polling, and a signed Cloud Storage result. No queue or database redesign is needed.
- The deployed service currently uses two vCPU, 2 GiB, concurrency four, a 900-second timeout, and max scale one. Keep those proven worker resources for launch; downsizing an FFmpeg worker without load/memory testing is false economy.
- `assets/runtime-packs/` is about **17.2 MiB**. The much larger `assets/packs/` tree includes authoring references and golden test files and must never enter the web build. Only publish runtime manifests, layers, fit masks actually needed at runtime, and thumbnails.
- The private movie bucket currently holds about 131 MiB, so current storage cost is negligible.

## Service choices and launch settings

### Static frontend: Firebase Hosting classic

Use Hosting classic rather than App Hosting because the client can be built as static HTML/CSS/JavaScript. Hosting includes 10 GB stored and 10 GB/month transferred at no cost; beyond that it is $0.026/GB-month stored and $0.15/GB transferred ([Hosting quotas and pricing](https://firebase.google.com/docs/hosting/usage-quotas-pricing)). A billing account is already required for Cloud Run, so the project will be Blaze even when Hosting usage is free.

Cost-sensitive asset rules:

- Ship `assets/runtime-packs`, never `assets/packs`, `references`, `goldens`, `design`, or authoring material.
- Load one Base Murti and small thumbnails first; lazy-load only the selected full-resolution layer and scene. Do not eagerly fetch both 8.6 MiB runtime packs.
- Give content-hashed JS/CSS and immutable art a one-year `Cache-Control: public,max-age=31536000,immutable`; give `index.html` `no-cache` so releases update safely. Firebase supports response-header rules in `firebase.json` ([Hosting configuration](https://firebase.google.com/docs/hosting/full-config)).
- Install a service worker/PWA cache only after its update behavior is tested. Browser caching materially reduces repeat-user transfer, but both Hosting cache hits and misses still count as Hosting-to-user transfer.
- Keep a small number of old Hosting releases. Stored releases share the same project-level 10 GB allowance.

### API and worker: Cloud Run

Keep a single service for the first release:

| Setting | Launch value | Reason |
|---|---:|---|
| Billing | Request-based | Pay only while an instance starts, shuts down, or handles a request. |
| Minimum instances | `0` | Scale to zero; accept a cold start rather than an idle bill. Minimum instances incur charges ([minimum instances](https://cloud.google.com/run/docs/configuring/min-instances)). |
| Maximum instances | `1` | Hard blast-radius and provider-spend control; matches the one-at-a-time task queue. |
| Concurrency | `4` | One worker request can run while authenticated status polls remain responsive. |
| CPU / memory | `2` / `2Gi` | Existing tested shape for FFmpeg; revisit after production profiling. |
| Timeout | `900s` | Matches the existing long-running worker contract. |
| CPU allocation | Throttled outside requests | Required for request-based economics; the worker does all work inside its task request. |
| Ingress | Public HTTPS | Browser calls require public ingress; Firebase ID token and App Check protect public application routes, while OIDC protects the internal task route. |

Mumbai is a Cloud Run Tier 1 region, so it has the lower regional price tier while remaining near the intended India audience ([Cloud Run pricing and region tiers](https://cloud.google.com/run/pricing)). Splitting API and worker into separate services can be reconsidered only if polling volume becomes material; at launch it adds deployment/IAM complexity and no fixed-cost saving because the current service already scales to zero.

### Firestore

Keep the existing single `(default)` Firestore Standard database in `asia-south1`. The free allowance is one database, 1 GiB stored, 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, and 10 GiB outbound/month. Mumbai overage prices are $0.03/100,000 reads, $0.09/100,000 writes, $0.01/100,000 deletes, and about $0.15/GiB-month stored ([Firestore pricing](https://cloud.google.com/firestore/pricing)).

The existing job/state model performs only a small number of writes per generation; status polling is the larger read source but remains inexpensive. Keep the TTL policy, while remembering that TTL deletes are billable and not part of the free delete allowance. A hundred thousand TTL deletions costs about $0.01.

### Private media storage and delivery

Keep one private **Standard** Cloud Storage bucket in `asia-south1`, co-located with Cloud Run. Mumbai Standard storage is approximately $0.02/GiB-month, single-region Class A operations are $0.005/1,000, Class B operations are $0.0004/1,000, and Internet transfer to Asian destinations starts at $0.12/GiB ([Cloud Storage pricing](https://cloud.google.com/storage/pricing)). Same-location transfer between Cloud Storage and another Google Cloud service is free.

Do not move media to a US region merely to chase the Cloud Storage Always Free allowance: its 5 GB-month/operation allowance applies only to `us-west1`, `us-central1`, and `us-east1`. The saving would be at most roughly $0.10/month while adding cross-region latency and transfer to the Mumbai worker.

Continue returning short-lived V4 signed URLs after an ownership read. This lets the user download directly from Storage instead of holding a Cloud Run instance open or paying Firebase Hosting's higher $0.15/GB transfer rate.

Retention must be explicit before production:

- Keep inputs for one day, provider-raw recovery video for seven days, and final movies for seven days at launch unless product/privacy policy requires longer.
- Align the Firestore attempt TTL with media availability, or make the UI clear that an expired server download must be regenerated/recreated locally.
- Source now applies the same seven-day lifecycle to `provider-raw/` as final movies; confirm the reviewed Terraform plan contains this change before production traffic.
- The bucket's seven-day soft-delete policy provides recovery but doubles the effective residence of short-lived deleted data. Soft-deleted objects continue accruing storage charges until final deletion ([soft delete](https://cloud.google.com/storage/docs/soft-delete)). Keep it for launch safety, then review after measuring cost.

### Authentication and App Check

Create a Firebase **Web App** in the existing Firebase project. Use anonymous Firebase Authentication to preserve the current owner-ID contract; enable automatic cleanup so anonymous accounts older than 30 days are deleted and excluded from Identity Platform MAU billing. Tier 1 providers, including anonymous/email/social, include 50,000 MAU free; the next 50,000 MAU are $0.0055 each ([Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)). Avoid phone auth at launch because SMS is separately billed.

Register that web app with Firebase App Check using an invisible score-based reCAPTCHA Enterprise web key. The no-cost allowance is 10,000 assessments per organization per month; 10,001–100,000 assessments incur an $8 flat monthly charge, then usage over 100,000 is $0.001/assessment ([reCAPTCHA billing](https://cloud.google.com/recaptcha/docs/billing-information)). App Check creates an assessment whenever its token refreshes; the default one-hour TTL refreshes approximately twice per hour ([App Check web setup](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)). Start with a 24-hour token TTL for this low-risk, short-session editor, while retaining server-side paid-generation limits; shorten it if threat monitoring justifies the added assessments.

Allow only:

- `https://PROJECT_ID.web.app`
- `https://PROJECT_ID.firebaseapp.com`
- the exact production custom domain, when connected

in Cloud Run CORS, Firebase Authentication authorized domains, and the reCAPTCHA web key. Restrict the browser API key by HTTP referrer and to the APIs the web client actually uses. A Firebase configuration/API key is intentionally public, but Google still recommends API restrictions ([Firebase security checklist](https://firebase.google.com/support/guides/security-checklist)).

### Small supporting services

| Product | Recurring no-cost allowance / price | Launch action |
|---|---|---|
| Cloud Tasks | First 1 million billable operations/month free, then $0.40/million ([pricing](https://cloud.google.com/tasks/pricing)). | Keep one concurrent dispatch and one dispatch/second. Retry deliveries also count but launch volume is tiny. |
| Secret Manager | Six active versions and 10,000 accesses/month free; then $0.06/active version-month and $0.03/10,000 accesses ([pricing](https://cloud.google.com/secret-manager/pricing)). | Keep one active version per required secret and do not inject any provider secret into frontend builds. |
| Artifact Registry | First 0.5 GiB-month per billing account free, then about $0.10/GiB-month; same-region pulls are free ([pricing](https://cloud.google.com/artifact-registry/pricing)). | Add a cleanup policy that retains the deployed digest and only a few recent images. |
| Cloud Build | 2,500 free `e2-standard-2` build-minutes per billing account/month, then $0.006/minute ([pricing](https://cloud.google.com/build/pricing)). | Use the existing Docker Cloud Build; normal launch deploy frequency should be free. |
| Cloud Logging | Normal launch logs should stay within the free ingestion allowance. | Never log artwork, credentials, ID tokens, App Check tokens, signed URLs, or raw personalization. Reduce successful task log sampling later if volume grows. |

### Vertex AI text/policy calls

Keep `STRUCTURED_MODEL_PROVIDER=vertex` and `VERTEX_LOCATION=global`. The current profile uses two `gemini-3.5-flash-lite` policy calls and one `gemini-3.6-flash` narrative call per new movie attempt. Current global standard prices are $0.30/$2.50 per million Flash-Lite input/output tokens and, through 2026-12-31, $0.75/$3.75 per million 3.6 Flash input/output tokens ([Vertex AI generative pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing)). For planning only, a short attempt totaling roughly 2,000 Flash-Lite input + 200 output tokens and 2,000 Flash input + 500 output tokens is about **$0.0045**. Actual image tokenization and model reasoning can change that number, so alert on billed usage rather than treating it as a quote.

No committed use or provisioned throughput plan is justified for a ten-day seasonal launch. Use on-demand standard priority.

## Rough monthly cost scenarios

Assumptions:

- a cold frontend visit transfers 6 MB because assets are lazy-loaded; repeat visits use browser cache;
- generated final video averages 10 MB and is downloaded once;
- a movie worker occupies the current 2-vCPU/2-GiB instance for 10 minutes;
- API request count, Firestore operations, Tasks, Secrets, Build, and Logging remain within their no-cost allowances;
- anonymous-auth cleanup is enabled;
- costs exclude fal.ai video and OpenAI image generation, which are external and can dominate total COGS.

| Scenario | Hosting | Cloud Run | GCS delivery | Vertex text/policy | App Check | Estimated GCP total |
|---|---:|---:|---:|---:|---:|---:|
| 1,000 cold visits + current hard guard of 30 movies/month | $0 | $0 | ~$0.04 | ~$0.14 | $0 | **~$0.20/month** |
| 10,000 cold visits + 30 movies/month | ~$7.50 | $0 | ~$0.04 | ~$0.14 | $0–$8 | **~$7.70–$15.70/month** |
| 100,000 cold visits + 30 movies/month | ~$88.50 | $0 | ~$0.04 | ~$0.14 | ~$8, assuming about one assessment/visit | **~$97/month** |

The current backend's transactional `MAX_PAID_VIDEO_SUBMISSIONS_PER_INDIA_DAY=1` means no more than about 30 paid video submissions/month without an intentional configuration change. If that guard is raised, 1,000 ten-minute movie jobs consume 1.2 million vCPU-seconds and 1.2 million GiB-seconds. After the monthly Cloud Run free tier, that is about **$26.58** of Cloud Run compute, plus roughly $4.50 Vertex text/policy and $1.20 for 10 GiB of signed-download egress—about **$32 additional GCP cost for 1,000 jobs**, before external model charges.

If anonymous cleanup is not enabled or users become registered email/social accounts, 100,000 MAU adds about **$275/month** for the 50,000 users above the free Identity Platform tier. This makes cleanup a meaningful launch control.

The largest uncertainty is frontend transfer. If every cold visitor downloads the entire current 17.2 MiB runtime catalog instead of a 6 MB working set, the Hosting free allowance lasts for only about 580 cold visits and 10,000 visits cost roughly $24 beyond the free 10 GB. Lazy loading and immutable caching are therefore mandatory, not polish.

## Budgets and hard controls

Enable the existing Terraform monthly budget (`manage_billing_budget=true`) and start with an overall **₹2,500/month alerts-only budget** at 25%, 50%, 75%, 90%, and 100% actual spend plus a 100% forecast alert. Route notifications to an actively monitored address. A normal budget is an alert, not a cap ([Cloud Billing budgets](https://cloud.google.com/billing/docs/how-to/budgets)).

Use layered hard controls:

1. Retain Cloud Run max instances one.
2. Retain Cloud Tasks concurrency one / dispatch rate one per second.
3. Retain the Firestore transaction-backed one-paid-video-per-India-day guard until the product owner explicitly raises it.
4. Set provider-side fal.ai and OpenAI usage/spend limits; GCP budgets do not see those invoices.
5. Create Preview **spend-cap budgets** for Cloud Run and Vertex AI/Agent Platform if the billing account is eligible—for example ₹1,000/month for Cloud Run and ₹500/month for Vertex during launch. These services are currently eligible, but enforcement is not instantaneous and a triggered cap pauses new service usage until manually lifted ([spend-cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)). Do not treat Preview caps as the only control.
6. Review Firebase Hosting transfer daily during the festival window; Hosting is not currently listed as eligible for service spend caps.

## Domain and TLS

Launch immediately on the free `PROJECT_ID.web.app` URL. It already has HTTPS and avoids making the ten-day deadline depend on DNS. Connect an owned branded domain in parallel; Firebase Hosting provisions, renews, and serves its SSL certificate on the global CDN at no added Hosting charge ([custom domains](https://firebase.google.com/docs/hosting/custom-domain)). DNS verification and certificate provisioning can take up to 24 hours.

Do not buy Cloud DNS merely for this app if the registrar already provides DNS—the extra managed-zone cost and migration add no launch value. Domain registration is the only unavoidable domain-specific external/annual cost.

Use the `run.app` URL as the API origin; Google manages its TLS certificate. Do not add a global HTTPS load balancer or Cloud Run custom-domain mapping for launch.

## Current production-readiness gaps found on 2026-09-04

This is the final readiness record for the deployed web client and billable-generation backend:

1. The Cloud Run service is named `devotional-movies-staging` but currently runs `APP_ENV=production`, Vertex, fal.ai, the production LTX profile, and a one/day paid limit. Treat it as production or rename deliberately; do not assume its name makes it fake.
2. **Completed 2026-09-04:** strict `/v1` preflight/CORS is deployed in revision `devotional-movies-staging-00017-wxq`. The exact preview origin returned 204 with the reviewed methods/headers; an unlisted origin returned 403 before authentication.
3. **Completed 2026-09-04:** `FIREBASE_APP_IDS` on the serving revision contains both the legacy iOS App ID and the new Web App ID. The configured preview completed anonymous sign-in, App Check, and an authenticated economy read without a billable submission.
4. **Completed 2026-09-04:** Firebase Web App `1:378578536975:web:397d379ea60638dca6317a` is registered. Its score-based reCAPTCHA Enterprise App Check key allows only the two Firebase Hosting domains, uses a 24-hour token TTL and 0.5 minimum score, and automatic cleanup of anonymous accounts is enabled. Backend enforcement still waits on item 3 so the iOS app cannot be accidentally excluded.
5. **Partially completed 2026-09-04:** the auto-created Firebase browser key now accepts only the two exact Hosting referrers. Firebase's generated API-target allowlist remains broad; narrow it only after a deployed Auth/App Check smoke test establishes the exact required set, since an over-narrow restriction would break launch identity.
6. Terraform source now includes `aiplatform.googleapis.com` and `roles/aiplatform.user`; reconcile/import live state and confirm a clean, reviewed plan before applying.
7. Terraform now defaults and validates production video generation to durable `fal`, matching `server.ts`; confirm the reviewed production profile explicitly.
8. Terraform now sets `STRUCTURED_MODEL_PROVIDER=vertex` and does not attach `GEMINI_API_KEY` unless `developer-api` is explicitly selected. Vertex uses the runtime service account.
9. **Mostly completed 2026-09-04:** read-only signed-object CORS plus one-day input and seven-day movie/provider-raw lifecycle rules are deployed on the private bucket. One explicitly authorized production video completed: the deployed browser fetched its signed URL, verified the expected byte SHA-256, saved it to IndexedDB, and played the six-second 720×1280 H.264/AAC result without console errors. The stored 1,299,670-byte object independently matched the Firestore digest and returned the requested 1,024-byte range. Expired-link recovery still needs a timed/manual expiry test.
10. Apple StoreKit endpoints are not web payments. Do not expose purchase UI until a web merchant/provider decision and backend contract exist.
11. **Completed 2026-09-04:** the product owner confirmed all technical, cultural, and rights sign-offs. The seated and dancing manifests contain 74 named approved review records in total, their ledgers reference `assets/RELEASE_SIGNOFF.json`, and both runtime packs pass release-policy staging with `reviewStatus: approved` and `releaseEligible: true`.
12. **Completed 2026-09-04:** the verified bundle was published to `https://project-d5db8f30-7db5-4b54-925.web.app`. The production CSP explicitly permits Firebase's current `content-firebaseappcheck.googleapis.com` token-exchange endpoint. A fresh headless-browser trace received 200 responses from reCAPTCHA Enterprise, App Check, anonymous Auth, and the authenticated backend economy route; no billable generation was submitted during this smoke test.
13. **Completed 2026-09-04:** project-scoped GCP billing budget `Ganpati Studio Web Launch` is active for ₹2,500 per month, notifying default billing IAM recipients at 25%, 50%, 75%, 90%, and 100% actual spend and 100% forecast spend. This is alerting rather than a hard cap; Cloud Run max one and the one-paid-video-per-India-day transaction remain the hard exposure controls.

## Deployment runbook

The repository already treats Terraform as infrastructure source of truth. Reconcile/import live resources and obtain a clean plan before applying; do not blindly create duplicates. Use immutable image digests.

### 1. Build and deploy the backend image

```sh
export GANPATI_PROJECT_ID=project-d5db8f30-7db5-4b54-925
export GANPATI_REGION=asia-south1
export GANPATI_IMAGE_TAG=web-launch-20260904

gcloud config set project "$GANPATI_PROJECT_ID"
gcloud builds submit backend \
  --config backend/cloudbuild.yaml \
  --substitutions "_IMAGE_TAG=$GANPATI_IMAGE_TAG"

gcloud artifacts docker images describe \
  "$GANPATI_REGION-docker.pkg.dev/$GANPATI_PROJECT_ID/devotional-movies/devotional-backend:$GANPATI_IMAGE_TAG" \
  --format='value(image_summary.digest)'
```

Put the resulting `@sha256:...` image reference in reviewed production Terraform variables, then:

```sh
terraform -chdir=backend/infra/terraform init
terraform -chdir=backend/infra/terraform plan \
  -var-file=production.tfvars \
  -out=production.tfplan
terraform -chdir=backend/infra/terraform apply production.tfplan
```

Before `apply`, reconcile the remaining live drift, set `environment="production"`, `video_generation_provider="fal"`, `structured_model_provider="vertex"`, `enable_billable_generation=true`, the web App Check ID allowlist, `manage_billing_budget=true`, and the immutable digest. Add secret payloads out of band with Secret Manager; never put them in `.tfvars`, frontend `.env`, build output, or source control.

### 2. Reconcile the registered Firebase Web App

The app already exists. Import it into Terraform state, then use the current Firebase CLI to retrieve only its public SDK configuration:

```sh
npx firebase-tools apps:list \
  --project "$GANPATI_PROJECT_ID"
npx firebase-tools apps:sdkconfig WEB FIREBASE_WEB_APP_ID \
  --project "$GANPATI_PROJECT_ID"
```

Add the web app ID to backend App Check verification. The Enterprise score-based reCAPTCHA key and App Check registration are already configured for the exact Hosting domains; monitor metrics and only then enable enforcement. Firebase's official guide recommends monitoring legitimate traffic before enforcement ([App Check enforcement flow](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)).

### 3. Build, preview, and publish the frontend

Assuming the static client lives in `web/` and produces `web/dist/`:

```sh
npm --prefix web ci
npm --prefix web run build

npx firebase-tools hosting:channel:deploy prelaunch \
  --project "$GANPATI_PROJECT_ID"

npx firebase-tools deploy --only hosting \
  --project "$GANPATI_PROJECT_ID"
```

Firebase's canonical production command is `firebase deploy --only hosting` ([Hosting deployment](https://firebase.google.com/docs/hosting/quickstart)). Build-time Firebase values may be public configuration; provider secrets must never receive a browser-exposed prefix such as `VITE_`.

### 4. Launch verification

- Open the exact deployed Hosting URL in a clean browser and a phone browser.
- Verify anonymous sign-in and App Check token issuance.
- Verify CORS preflight allows only the exact production origins, methods, and `Authorization`, `Content-Type`, and `X-Firebase-AppCheck` headers.
- Submit one fake/non-billable end-to-end job first; then one explicitly authorized production job. Confirm Cloud Tasks OIDC, Firestore state, signed download, and lifecycle metadata.
- Confirm Cloud Run remains at zero instances when idle and never exceeds one under load.
- Check Hosting transfer, Cloud Run billable instance time, Firestore operations, Storage egress, reCAPTCHA assessments, Vertex cost, and external provider cost dashboards.
- Confirm budget email delivery and the separate provider spend limits before announcing the URL.
