# Ganpati Studio web launch runbook

Target: a production-suitable web launch within ten days, preserving the current Swift product model and existing backend contracts. The static editor is already useful without cloud generation; cloud features must fail closed until configured.

## Release boundary

The web product includes the seated and dancing Base Murtis, all current fitted shringar slots, deterministic Canvas composition, undo/redo/reset/presets, high-resolution PNG export, IndexedDB persistence, Web Share/download, local creation library, and the existing resumable devotional-video contract.

It intentionally does not claim or emulate native-only behavior:

- Apple StoreKit purchase delivery is not exposed on web.
- App Attest becomes Firebase Web App Check with reCAPTCHA Enterprise.
- browser storage is not cloud backup and can be evicted.
- no “seat” selector exists because the native asset manifest does not define one.
- enhanced still generation stays feature-gated until its backend route has production hash recomputation plus credit/rate/spend protection.

## Cheapest selected topology

- Firebase Hosting classic (Blaze project; static CDN, managed TLS)
- existing Cloud Run service in `asia-south1`, request-based, minimum zero, maximum one, concurrency four
- existing Firestore Standard, Cloud Tasks, regional private GCS, Artifact Registry, Secret Manager, and Vertex AI
- `PROJECT_ID.web.app` for launch; add a custom domain in parallel only if DNS is already controlled
- ₹2,500/month alerting budget plus provider-side hard limits; budgets alone are not caps

The sourced rationale and cost scenarios are in `docs/gcp-hosting-research.md`.

## Ten-day sequence

### Days 1–2: product and artwork sign-off

1. Complete technical and cultural review for both `assets/runtime-packs` manifests. Production must not ship while their review state is pending.
2. Confirm rights/source ledgers for every shipping raster.
3. Run the local editor journey for seated and dancing Murtis on phone and desktop.

### Days 2–4: Firebase web identity

1. Create a Firebase Web App in the existing project.
2. Enable anonymous Authentication and automatic anonymous-account cleanup.
3. Register reCAPTCHA Enterprise App Check for exact Hosting/custom domains; monitor valid traffic before enforcement.
4. Restrict the public Firebase browser key by HTTP referrer and required APIs.
5. Copy `web/.env.example` to `web/.env.local` and fill only public Firebase identifiers, App Check site key, and the Cloud Run origin.

### Days 4–6: backend staging-fake tracer bullet

1. Build an immutable backend image and reconcile/import Terraform state.
2. Set `firebase_app_ids` to both iOS and Web IDs.
3. Set `web_allowed_origins` to exact preview and production origins.
4. Keep `environment="staging-fake"` and `enable_billable_generation=false` for the first end-to-end run.
5. Verify allowed preflight, denied-origin failure, Firebase ID/App Check verification, Cloud Tasks OIDC, Firestore status, GCS signed fetch/range, SHA-256 integrity, and expiry.

### Days 6–8: production controls

1. Review one clean Terraform plan using an immutable image digest.
2. Confirm Cloud Run `min=0`, `max=1`, concurrency four; Tasks concurrency/rate one; provider profile; one paid video per India day.
3. Enable the ₹2,500 GCP alerting budget and provider-side fal/OpenAI spend limits.
4. Keep web checkout and enhanced still generation disabled.
5. Run one explicitly authorized billable video and verify recovery from a page reload.

### Days 8–10: preview, accessibility, publish

1. Build and test with Node 24 LTS.
2. Deploy a Firebase Hosting preview channel and test clean Chrome/Safari plus a physical phone.
3. Test keyboard-only operation, visible focus, screen-reader names, reduced motion, Hindi/Marathi input, Web Share fallback, offline revisit, and storage-cleared states.
4. Publish Hosting, probe the production origin, watch budget/usage dashboards, and retain rollback access to the previous Hosting release.

## Commands

```sh
npm --prefix web ci
npm --prefix web test
npm --prefix web run build

npm --prefix backend ci
npm --prefix backend test

tofu -chdir=backend/infra/terraform fmt -check
tofu -chdir=backend/infra/terraform validate

npx firebase-tools hosting:channel:deploy prelaunch --project PROJECT_ID
npx firebase-tools deploy --only hosting --project PROJECT_ID
```

Before Terraform apply, read `backend/infra/terraform/README.md`; existing live resources must be imported/reconciled, not blindly recreated.

## Go/no-go checklist

- [x] Both runtime packs pass the release policy with approved technical, cultural, and rights sign-off.
- [x] Firebase Web App, anonymous Auth cleanup, App Check registration, and exact Hosting-referrer restrictions are configured.
- [x] Exact production/preview origins are present in Cloud Run and GCS CORS; a denied origin returns 403.
- [x] Serving backend image is immutable and its deployed digest is recorded; Terraform reconciliation and a reviewed clean plan remain.
- [x] Hosting preview passes seated/dancing creation, 2× export, persistence, and refresh recovery; physical-device share-sheet QA remains.
- [x] Staging-fake tracer was superseded by the stricter explicitly authorized production tracer.
- [x] One explicitly authorized production video completes through Cloud Tasks, Vertex/fal, FFmpeg, private GCS, signed browser download, SHA-256 verification, playback, and IndexedDB recovery.
- [x] A project-scoped ₹2,500 monthly GCP budget alerts at 25/50/75/90/100% actual and 100% forecast; provider exposure is separately bounded by the one-paid-video-per-India-day transactional guard.
- [x] Privacy copy matches deployed one-day input and seven-day raw/final lifecycle rules.
- [x] No StoreKit checkout or unsafe enhanced-still action is enabled on web.
- [x] Product owner owns rollback and cost/availability monitoring through 2026-09-15 (Asia/Kolkata); Firebase Hosting retains prior releases for rollback.

Permanent production site: `https://project-d5db8f30-7db5-4b54-925.web.app` (published 2026-09-04). Its deployed 108-file artifact matches the locally verified production bundle byte-for-byte. Both release-policy pack reports are public and show `reviewStatus: approved` and `releaseEligible: true`. A clean-browser production smoke test completed reCAPTCHA Enterprise, anonymous Auth, Firebase App Check, exact-origin CORS, and an authenticated economy read without submitting a paid video.

Release-evidence closeout: all 28 seated and 24 dancing deterministic golden composites were generated from the signed manifests, visually inspected as contact sheets, recorded in their authoring packs, and passed exact `verify-goldens` comparison under the release policy. The product-owner attestation also binds the application icon, web previews, and generated material textures to explicit SHA-256 hashes.

Current time-limited preview: `https://project-d5db8f30-7db5-4b54-925--prelaunch-ben1b4ln.web.app` (expires 2026-09-11). It carries `noindex`; remove its hostname from Auth, reCAPTCHA, API-key, Cloud Run, and GCS allowlists when the channel expires.

Production-video tracer result (2026-09-04): attempt `ec59a071-8f1d-4fec-a969-f62e053cdf74` completed once after a 284.5-second Cloud Tasks worker request. The saved H.264/AAC MP4 is 1,299,670 bytes, 720×1280, six seconds, and matches backend SHA-256 `e279e9afdc473251ff2931365883fb2dba61e62b772ec35718623e44616fdfa5`. The deployed browser fetched the signed object, performed its own hash check before saving, played it with no console error, recovered it after navigation, and no longer retained a stale pending card. The paid daily guard was restored to one before this report.

## Production hardening release · 2026-09-05

The current web build is deployed to the permanent Hosting URL. All 116 files were verified byte-for-byte against `web/dist`. Service-worker content version: `377bea5cb7e8dff348486c6b`.

Backend revision `devotional-movies-staging-00020-nz5` serves 100% of traffic using immutable image digest `sha256:183fcb83d0b26a02198b7510f09ec2628f768cd549a79cef67677e9f3d44a5e4`. The reviewed scoped deployment updated only the image and exact fal media-host allowlist. Existing runtime identity, secret references, concurrency four, 900-second timeout, maximum one instance and one paid submission per India day were preserved. Terraform format/validation passed; existing resources still require full state adoption before any broad Terraform apply.

Verification completed:

- 25 web tests and 84 backend tests passed, including interrupted upload recovery, stale-worker exclusion, bounded retries and local-save quota handling.
- 42 route/viewport checks passed with no overflow, broken images, undersized targets or console/network failures; 22 keyboard targets passed obstruction checks.
- Both Base Murtis passed composition, local saving, PNG download and reload recovery on production.
- Production Firebase Auth/App Check and authenticated economy read passed, with zero paid submissions.
- Two-step video deletion, privacy clearing, offline artwork reopening and online resume passed.
- An installation of the previous production release retained its saved Design after upgrade and removed its old caches.
- Production Hosting CSP excludes unsafe-inline; backend responses enforce private/no-store and nosniff. Unauthorized identity, unapproved origin and missing task credentials were rejected; enhancement remained disabled.
- Production Lighthouse: Performance 94, Accessibility 100, Best Practices 100, SEO 100. Both dependency audits reported zero vulnerabilities.

Evidence lives in `.verification/production-e2e-final.json`, `production-storage-final.json`, `upgrade-final.json`, `mobile-web-audit-final.json`, `keyboard-focus-final.json`, `backend-production-security.json`, `hosting-security-final.json` and `lighthouse-production-release.json`. Module responsibilities are documented in `docs/WEB_MODULES.md`.

No new paid video was generated for this release; the prior authorized real-provider tracer remains the production generation evidence. Physical-phone native sharing and a formal penetration test were not performed. Enhanced still generation and web checkout remain deliberately disabled.
