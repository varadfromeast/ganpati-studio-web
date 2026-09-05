# Personalized devotional movie backend

This directory implements the durable `202 Accepted` devotional-movie contract in
`docs/PERSONALIZED_DEVOTIONAL_VIDEO_IMPLEMENTATION_DESIGN.md`.

The public interface is deliberately small:

- `POST /v1/devotional-movies` accepts one immutable PNG plus normalized metadata;
- `GET /v1/devotional-movies/attempts/:attemptId` returns processing or a terminal result;
- `POST /v1/enhanced-stills` enhances a still while keeping the OpenAI key server-side;
- `GET /v1/generation-economy` and `POST /v1/generation-economy/apple-transactions`
  expose the account credit projection and idempotent verified purchase delivery;
- `POST /v1/apple-server-notifications` verifies Apple's signed payload and applies refunds,
  revocations, and refund reversals idempotently;
- `POST /internal/devotional-movies/:attemptId/process` accepts only the configured Cloud
  Tasks OIDC caller.

The backend never returns provider prompts, model identifiers, object keys, Firebase tokens,
or policy reasoning to the app.

## Local verification

Use Node 24 or newer:

```sh
npm install
npm test
npm audit --omit=dev
```

The tests cover the two policy gates, trusted prompt construction, ownership, idempotency,
durable acknowledgement ordering, deterministic queue names, fresh signed grants, provider
submission ambiguity, profile-aware provider-operation resume, provider-neutral structured
model adapters, HTTP authentication, exact-origin browser CORS, multi-app Firebase App Check,
enhanced-still credential isolation, raw provider-video
durability, silent-result rejection, generation credits, refund reversal, and
English/Hindi/Marathi overlay limits.

Local HTTP mode is intentionally impossible unless explicitly enabled:

```sh
APP_ENV=local \
ALLOW_INSECURE_DEVELOPMENT_AUTH=true \
npm start
```

Local-only credentials are `Bearer development-user:<owner>` and
`X-Firebase-AppCheck: development-app-check`. Never deploy that mode.

## Cloud modes

`APP_ENV=staging-fake` uses real Firebase verification, Firestore, private GCS, Cloud Tasks,
and queue OIDC, but replaces every model with deterministic provisional/fake adapters. The
fake video path uses FFmpeg, so it produces a real shareable H.264 MP4 without a billable
model call.

`APP_ENV=production` uses Gemini on Vertex AI for policy/narrative generation and fal's durable queue for
video. It refuses to start unless `ENABLE_BILLABLE_GENERATION=true` is explicitly supplied.
Production defaults to `STRUCTURED_MODEL_PROVIDER=vertex`, authenticates with the Cloud Run service
account, and accepts `VERTEX_LOCATION` (default `global`). The runtime identity needs
`roles/aiplatform.user`. `STRUCTURED_MODEL_PROVIDER=developer-api` remains available for isolated
experiments and requires `GEMINI_API_KEY` from Secret Manager. Production also requires a positive
`MAX_PAID_VIDEO_SUBMISSIONS_PER_INDIA_DAY`, `VIDEO_GENERATION_PROVIDER=fal`, `FAL_API_KEY`
from Secret Manager, and a supported `FAL_VIDEO_PROFILE_VERSION` from
`src/model/falVideoProfiles.ts`. The standard launch profile selected by the recorded benchmark
and human review is `gemini-text-fal-ltx-2.5-pro-speaking-v1`. Direct synchronous Gemini video
submission is disabled because it cannot durably expose an operation ID before waiting for
completion.

Never place either provider key in an environment file or in the iOS app.

Enhanced still generation is enabled only when `OPENAI_API_KEY` is supplied. StoreKit delivery
and App Store Server Notifications are enabled only when `APPLE_ROOT_CA_PATHS` points to Apple's
trusted root certificates. Set `APPLE_STORE_ENVIRONMENT=Production` and `APPLE_APP_ID` for the
production verifier; Sandbox is the default during development.

The intent layer runs before video-credit or paid-video reservation. It first classifies the
submitted dedication, recipient, occasion, and locale. Only an explicit `allow` can proceed. It
then classifies the generated personalized message and motion brief a second time. A blocked,
uncertain, or unavailable classifier rejects the attempt without calling the video provider or
consuming a video credit. Only after both gates allow does the billable-attempt guard
transactionally reserve the user's credit and the global India-calendar-day paid-video slot. A
reservation is idempotent per attempt and deliberately remains consumed after an ambiguous video
provider response or later media-processing failure. The initial approved setting is one billable
video attempt per day for a ₹100/day ceiling.

Required common variables are documented in `infra/staging.env.example`. `SERVICE_BASE_URL`
must be the final HTTPS Cloud Run origin and is also the exact expected queue-token audience.

## Browser access

Set `WEB_ALLOWED_ORIGINS` to a comma-separated list of exact browser origins, including the
scheme and any non-default port. A configured value such as `https://studio.example` matches only
that origin: wildcards, paths, trailing slashes, and reflected arbitrary origins are rejected at
startup or request time. If the variable is absent, browser requests carrying `Origin` fail
closed; native clients that do not send `Origin` continue through the existing authentication
path unchanged.

Only `/v1` receives browser CORS handling. The `/internal` Cloud Tasks route and `/health` never
receive browser access headers. Successful public responses identify the exact allowed origin,
expose `Retry-After` and `x-source-composition-hash`, and vary on `Origin`. Preflight allows only
`GET` or `POST` with `Authorization`, `Content-Type`, `X-Firebase-AppCheck`, and
`Idempotency-Key`. The backend does not emit `Access-Control-Allow-Credentials`; browser auth
continues to use explicit Firebase bearer and App Check headers, not cookies. CORS is not an auth
boundary, so the normal token checks remain mandatory.

Register the browser as a Firebase Web App and configure its App Check provider. Set
`FIREBASE_APP_IDS` to the comma-separated iOS and web Firebase App IDs. If the plural variable is
absent, the existing `FIREBASE_APP_ID` single-app configuration remains the fallback. An App
Check token is accepted only when its verified `appId` exactly matches one of those entries.

Browser playback/download of private signed GCS URLs needs a separate bucket CORS policy. The
Terraform `web_allowed_origins` variable applies the same exact origins with read-only `GET` and
`HEAD` access. For a bucket managed outside Terraform, copy
`infra/gcs-cors.web.example.json`, replace every placeholder, and apply it from `backend/`:

```sh
gcloud storage buckets update gs://replace-with-private-movie-bucket \
  --cors-file=infra/gcs-cors.web.example.json
```

The example intentionally contains no wildcard and grants no upload method. Keep the GCS origin
list identical to `WEB_ALLOWED_ORIGINS`; signed URLs, ownership checks, generation gates, and
commerce semantics remain unchanged.

## Model module seams

Model providers do not appear in HTTP handlers, job orchestration, or SwiftUI. The backend has
three model interfaces:

- `DevotionalLanguageModel` for both policy evaluation and devotional narrative creation;
- `VideoGenerator` for video submission and provider-operation recovery;
- `DevotionalModelModule` for versioned profile selection and safe in-flight routing.

The deep `StructuredDevotionalLanguageModel` implementation owns prompts, strict schemas,
validation, request packaging, timeouts, and fail-closed behavior. Remote wire formats sit behind
its internal `StructuredOutputModel` seam. Gemini is the current adapter; another structured
model API can replace it without changing devotional policy or the director.

Every attempt persists its model profile. A rollout may activate a new profile while retaining
old adapters for in-flight operations. Unknown profiles fail safely rather than sending an old
operation ID to the wrong provider.

## Durable state and crash behavior

Firestore is authoritative. PNG and MP4 bytes live only in the private bucket. Deterministic
object and task names make a lost POST response safe to retry.

Immediately before the paid call, the record moves to `providerSubmitting` and stores the
approved message. The provider operation ID is persisted immediately after queue submission,
before status polling or result download. A later worker can retrieve that operation and finish
the same video after the lease expires. If the paid request may have reached a provider but no
operation ID was returned, the attempt becomes terminal `submissionUnknown` and is never
automatically submitted again.

When the provider finishes, its original MP4 is stored immutably under `provider-raw/` and its
hash is attached to the attempt before FFmpeg processing starts. Finishing recovery reads that
stored object, never resubmits or redownloads paid output. The final contract requires portrait
H.264 video plus AAC audio. Finishing replaces provider audio with a deterministic, rights-clear
synthesized ambient bed and never asks the provider to speak the user's message; the exact
approved message is rendered as an overlay.

The fal.ai adapter uploads the source PNG and requests one-hour input/output object lifetimes,
submits at normal queue priority, and resumes by request ID without uploading or submitting
again. Its audited profiles include the selected LTX 2.5 Pro route and retained benchmark
alternatives. The selected profile is recorded on every
attempt so changing the active profile does not strand in-flight work.

Signed GCS URLs are generated only after an ownership read and are never stored.

## Staging retention

`infra/gcs-lifecycle.staging.json` deletes `inputs/` after one day and `movies/` after seven
days. Firestore records carry `expiresAt` and use the Firestore TTL policy. These are staging
defaults; production retention still requires explicit product/privacy approval.

## Deployment guardrails

The initial safe deployment should use:

- one Cloud Run instance maximum;
- Cloud Run request concurrency four so one worker cannot starve authenticated status polling;
- one Cloud Tasks concurrent dispatch and one dispatch per second;
- `APP_ENV=staging-fake`;
- the existing runtime service account;
- public Cloud Run ingress, with Firebase checks on public routes and strict OIDC checks on
  the internal route.

Do not switch to `production`, attach model secrets to a live revision, or run live model
fixtures without an approved limit and an active request-time guard. Initial billable staging
authorization was granted on 2026-08-25 for one paid video submission per India day under a
₹100/day ceiling.

## One-off fal video comparison

`src/experiments/runFalVideoBenchmark.ts` is an explicitly gated benchmark runner, separate from
the production job route and its one-profile-per-attempt invariant. It uploads one approved PNG
once, submits all audited fal image-to-video profiles concurrently, applies the normal deterministic
six-second H.264/message finisher, and stores the source, videos, per-model checkpoints, request IDs,
pricing snapshot, and latency manifest under the private movie bucket's
`experiments/fal-video-benchmark/<run-id>/` prefix.

Build first, then provide `ENABLE_FAL_VIDEO_BENCHMARK=true`, `FAL_API_KEY`, `MOVIE_BUCKET`, and
`BENCHMARK_SOURCE_IMAGE`. The API key must come from Secret Manager or the process environment;
never write it into this repository. Each run submits five billable operations, so use this only
after an explicit spend approval. Set a unique `BENCHMARK_RUN_ID`; the runner atomically refuses
to create a second run with the same ID before any fal call. To recover an interrupted run, supply
the original `BENCHMARK_RUN_ID` with `BENCHMARK_RESUME=true`. Resume validates the stored source,
prompt, profile/endpoint identities, and request checkpoints, then polls those request IDs without
uploading the image or submitting another paid operation.
