# Mobile-web, accessibility, security, and resilient media-job practices (2026)

Research date: 2026-09-05
Target: Ganpati Studio's static React/Vite client on Firebase Hosting, using Firebase anonymous Authentication, Firebase App Check with reCAPTCHA Enterprise, and a Cloud Run + Cloud Tasks video backend.

## Executive recommendation

Keep the present architecture. Its important boundaries are sound: static assets on Firebase Hosting; browser identity through Firebase Auth; attestation through App Check; a short submit request followed by a durable asynchronous task; status stored server-side; and private media delivered through expiring signed URLs.

The highest-value work is to harden those boundaries and make failure recovery explicit:

1. Verify both the Firebase ID token and App Check token at every public API route, then authorize every attempt/object against the verified `uid`. App Check and Authentication are complementary, not substitutes, and App Check alone does not eliminate abuse ([Firebase App Check overview](https://firebase.google.com/docs/app-check)).
2. Treat the video workflow as a durable state machine. Preserve the attempt ID before upload, make submit and worker execution idempotent, expose truthful server-owned states, and recover after reload, offline periods, expired signed URLs, and storage eviction. Cloud Tasks is at-least-once delivery, so handlers must tolerate duplicate execution ([Cloud Tasks overview](https://cloud.google.com/tasks/docs/dual-overview)).
3. Set a WCAG 2.2 AA mobile baseline: reflow at a 320 CSS-pixel viewport, visible focus, at least 24-by-24 CSS-pixel targets (prefer roughly 44-by-44 for primary touch actions), non-drag alternatives, orientation independence, reduced motion, and programmatic status messages ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)).
4. Make the art-heavy first load intentional: send only the active Base Murti and small thumbnails initially, eagerly load the LCP image, lazy-load offscreen/unselected layers, reserve image dimensions, and hold the mobile 75th percentile to LCP <=2.5 s, INP <=200 ms, and CLS <=0.1 ([web.dev Web Vitals](https://web.dev/articles/vitals)).
5. Keep offline behavior progressive and honest. Cache only the versioned app shell and public immutable art; never cache Firebase tokens, personalized API responses, or signed media URLs in the service worker. Explain that cloud generation needs a connection and that anonymous identity/local creations are scoped to this browser unless the user upgrades the account.

## Scope and repository observations

This is a best-practices review, not a formal WCAG conformance audit or penetration test. It is tailored to the repository state inspected on 2026-09-05:

- `firebase.json` already sets a restrictive CSP, clickjacking protection, MIME sniffing protection, a referrer policy, a permissions policy, no-cache navigation documents, and long-lived caching for built assets.
- `web/public/sw.js` limits interception to same-origin `GET` requests and separates shell/asset caching from runtime packs. This is a useful safe boundary.
- `web/src/services/firebase.ts` uses persistent anonymous Auth and reCAPTCHA Enterprise App Check with automatic token refresh.
- `web/src/services/backend.ts` sends both credentials, supplies an `Idempotency-Key`, uses an asynchronous status endpoint, and verifies downloaded video byte count and SHA-256.
- `web/src/services/persistence.ts` persists pending attempts and completed video blobs in IndexedDB.
- `web/src/pages/PendingVideoPage.tsx` polls the server-provided interval and tells users that they can leave safely.

These observations explain the priorities below; they do not assert that the corresponding backend checks are complete.

## 1. Mobile layout and WCAG 2.2 accessibility

### Required interaction baseline

- Design and test every route at a 320 CSS-pixel-wide viewport without loss of information or two-dimensional scrolling, except content that intrinsically requires it. This is the practical mobile interpretation of WCAG 2.2 Reflow ([W3C Understanding 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)). Support both portrait and landscape instead of locking orientation ([W3C Understanding 1.3.4](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html)).
- Make all controls operable by keyboard, show a high-contrast focus indicator, and ensure sticky headers/dialogs never fully obscure the focused element. Visible focus is required independently of pointer hover ([W3C Understanding 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)).
- Meet the WCAG 2.2 AA minimum target size of 24-by-24 CSS pixels or provide the prescribed spacing exception; use a larger approximately 44-by-44 target for primary touch actions, destructive controls, and dense carousels where practical ([W3C Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- If artwork selection or arranging ever uses dragging, expose an equivalent tap/click control. WCAG 2.2 requires a non-dragging alternative unless dragging is essential ([W3C Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)).
- Give icon-only buttons accessible names, associate every input with a persistent label and error/help text, and keep DOM order aligned with visual order. Do not rely on color, placement, or an icon alone to convey selected, failed, or completed state.

### Motion, progress, and media

- Respect `prefers-reduced-motion`; remove decorative orbit/spinner motion and nonessential transitions while keeping an unambiguous static progress state. The media query reflects an operating-system request to minimize nonessential motion ([MDN `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)); animation triggered by interaction must be disableable unless essential ([W3C Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)).
- Announce meaningful transitions such as "Upload accepted", "Video ready", and terminal failures with `role="status"`/polite live regions, without moving focus merely to announce them. WCAG's status-message guidance requires assistive technology to receive the update without a focus change ([W3C Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)). Do not make the whole polling panel live: unchanged polling renders can cause repeated announcements.
- Give generated video a text description of what it contains and label controls. If future videos include meaningful speech, lyrics, or instructions, provide captions/transcripts; if they are purely decorative devotional motion, describe that fact rather than inventing dialogue.
- Localize accessible names, validation, progress, and error text alongside visible English/Hindi/Marathi copy. Set the document/fragment language correctly so names and dedication text are pronounced more predictably.

### Verification

Run keyboard-only and screen-reader journeys on real mobile browsers, not only jsdom. Include 200% text zoom, 400% page zoom/reflow, landscape, large text, reduced motion, forced-colors/high contrast, VoiceOver on iOS Safari, TalkBack on Android Chrome, and Hindi/Marathi composition and line wrapping. Automated checks are a useful gate but cannot validate reading order, touch ergonomics, announcements, or cultural clarity.

## 2. Performance for an image-heavy React/Vite client

### Budgets and measurement

Use Core Web Vitals as release budgets at the 75th percentile, measured separately for mobile and desktop: LCP <=2.5 seconds, INP <=200 milliseconds, and CLS <=0.1 ([web.dev Web Vitals](https://web.dev/articles/vitals)). Collect privacy-conscious field measurements because lab tests cannot reproduce the full range of Indian mobile devices, thermals, and networks.

### Loading strategy

- Keep route-level dynamic imports. Split editor, video creation, and library features so a landing/editor visit does not parse Firebase/video-only code until needed. React `lazy` and dynamic imports are the supported component-level pattern ([web.dev React code splitting](https://web.dev/articles/code-splitting-suspense)).
- Put the likely LCP Base Murti URL in discoverable HTML as early as the route permits, load it eagerly, and use `fetchpriority="high"` only for that genuinely critical image. Do not lazy-load the in-viewport LCP candidate; eager above-the-fold plus liberal below-the-fold lazy loading tends to improve Web Vitals ([web.dev image lazy-loading guidance](https://web.dev/articles/lcp-lazy-loading)).
- Lazy-load offscreen thumbnails, inactive postures, unselected full-resolution layers, and video metadata. Native lazy loading reduces critical-path work ([MDN lazy loading](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Lazy_loading)). Use `srcset`/`sizes` or generated size variants for previews; retain full-resolution lossless sources only where Canvas export actually needs them.
- Include intrinsic `width`/`height` or `aspect-ratio` for images/video/canvas so the browser reserves space. Decode heavy images outside the input-critical path, predecode the next likely selection conservatively, and release superseded object URLs/bitmaps.
- Keep pointer/slider handlers below the INP budget: update the visible preview on `requestAnimationFrame`, avoid synchronously re-encoding the full canvas per gesture, and move expensive hashing/encoding to a worker where measurement shows main-thread stalls.

### HTTP and cache policy

- Keep hashed JS/CSS and immutable content-addressed art on `Cache-Control: public,max-age=31536000,immutable`; keep HTML and the service worker revalidated/no-cache so deploys do not strand users on an old shell. Firebase Hosting supports path-specific response headers ([Firebase Hosting configuration](https://firebase.google.com/docs/hosting/full-config)).
- Version runtime-pack URLs when their bytes change. A cache-first URL that is not content-versioned can preserve stale manifests or layers across releases.
- Do not precache the entire art catalog. The install/upgrade request should remain small and atomic; selected packs can populate an explicit runtime cache on demand.
- Preserve back/forward cache eligibility: avoid unnecessary `unload` handlers and recover polling/state on `pageshow`. The browser's bfcache can restore a previous page instantly from a memory snapshot ([web.dev bfcache](https://web.dev/articles/bfcache)).

## 3. PWA and browser storage

PWA features must enhance the normal website; installability and background APIs vary by browser. MDN explicitly frames PWAs as adapting to browser/device capabilities rather than assuming one universal feature set ([MDN PWA overview](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)).

### Service-worker boundary

- Cache the public shell, versioned app assets, and selected public art only. Never place Auth/App Check tokens, authenticated status responses, personalized prompts, private media, or signed URLs in Cache Storage. A signed URL is a bearer capability: anyone possessing it can access the object until expiry ([Cloud Storage signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls)).
- Use network-first navigation with a purposeful offline fallback. Show which capabilities are offline-ready and which require the network; offline UX guidance recommends explicitly communicating readiness ([web.dev offline UX](https://web.dev/articles/offline-ux-design-guidelines)).
- Treat service-worker updates as a state transition. Download a new shell completely, clean only caches owned by this app/version, and offer a non-destructive refresh after the new worker is ready. Never allow an old shell to write data in a schema it does not understand.
- Do not depend on Background Sync or Periodic Background Sync for correctness. They can opportunistically improve re-entry on supporting browsers, but normal foreground resume/polling remains authoritative.

### IndexedDB and identity durability

- Keep pending metadata small and durable: attempt ID, owner UID at submission, design ID, created/updated timestamps, latest known server state, and safe retry metadata. Store large final blobs only after checking storage availability; catch `QuotaExceededError`, provide direct download/share, and allow users to remove old videos. Browser quotas and eviction vary and writes can fail ([MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)).
- Consider `navigator.storage.persist()` after a clear user gesture or after the first saved creation, but never promise persistence. IndexedDB is designed for substantial offline data, yet it is still browser-managed storage ([MDN IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)).
- Be explicit that anonymous Auth and IndexedDB are browser-profile scoped. Clearing site data, private browsing, account cleanup, or moving devices can lose the local UID or files. Offer account linking before users need cross-device or long-term recovery; Firebase supports linking a temporary anonymous account to a permanent credential ([Firebase anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth)).
- Align server record/media retention with the identity promise. Automatic cleanup deletes anonymous accounts older than 30 days; it reduces billing/quota impact but is not a backup or portability mechanism ([Firebase anonymous Auth cleanup](https://firebase.google.com/docs/auth/web/anonymous-auth#auto-cleanup)).

## 4. Firebase Auth and App Check

### Distinct responsibilities

- Authentication answers "which user?" App Check answers "did the request come from an allowed app context?" Verify both on the custom Cloud Run backend. Firebase documents App Check and Auth as complementary, and warns that App Check does not guarantee elimination of abuse ([Firebase App Check overview](https://firebase.google.com/docs/app-check)).
- Send the Firebase ID token over HTTPS and verify it with the Admin SDK. Use the decoded `uid` for authorization; never accept a UID, owner ID, credit balance, price, hash, or role merely because the browser submitted it ([Firebase ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)).
- Require `X-Firebase-AppCheck` and verify it with the Admin SDK on every public application route. Successful verification establishes that the token came from an app in the Firebase project; optionally require the expected web App ID (`sub`) as an allowlist ([Firebase custom-backend verification](https://firebase.google.com/docs/app-check/custom-resource-backend)).
- Bind every status/read/download action to the verified `uid` and server-owned attempt record. User-controlled object IDs without per-object authorization are OWASP's Broken Object Level Authorization risk ([OWASP API Security 2023: API1](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)).

### Rollout and configuration

- Register every legitimate production/preview app before enforcement, create a score-based reCAPTCHA Enterprise key for only the exact served domains, never add `localhost` to a production key, monitor App Check metrics, then enforce. Firebase recommends gradual threshold changes to avoid denying legitimate users ([Firebase reCAPTCHA Enterprise App Check](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)).
- Keep automatic App Check token refresh enabled. Tune TTL only from observed threat, latency, and assessment-cost data: Firebase permits 30 minutes to 7 days, defaults to one hour, and refreshes at approximately half the TTL ([Firebase reCAPTCHA Enterprise App Check](https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider)).
- Consider App Check replay protection only for the billable submission route. It is currently a Node.js-only beta, consumes the token once, and adds a verification network round trip; Firebase recommends it only for particularly sensitive endpoints ([Firebase custom-backend replay protection](https://firebase.google.com/docs/app-check/custom-resource-backend#replay-protection)). Idempotency and transactional quota/credit controls remain required even with replay protection.
- Firebase web configuration and its API key are not secrets. Still apply HTTP-referrer and API restrictions, keep provider/service-account secrets exclusively in Secret Manager, and never embed signed URLs or credentials in logs. Firebase says authorization must rely on IAM, Security Rules, and App Check rather than API-key secrecy ([Firebase security checklist](https://firebase.google.com/support/guides/security-checklist)).

## 5. Cloud Run/API/Cloud Tasks security

### Public browser API

- Keep only the browser-facing routes publicly reachable. Apply exact-origin CORS for production and intentional preview origins; do not reflect arbitrary origins or use `*`. CORS tells browsers which origins may read a response but is not authentication or object authorization ([OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)).
- Validate all metadata with allowlists and strict length/count bounds. For artwork, limit request bytes, decoded pixel count, dimensions, format, decompression ratio, processing time, and frequency; inspect file signatures/decoded content instead of trusting extension or `Content-Type`. OWASP recommends type/signature validation, generated filenames, size limits, and storage outside the web root ([OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)).
- Enforce transactional per-UID and global limits before any billable provider call: credits, concurrent attempts, daily submissions, payload size, provider duration/resolution, retries, and total spend. Unbounded upload/compute/provider use is an unrestricted-resource-consumption risk ([OWASP API Security 2023: API4](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/)). Budgets and alerts are detection; queue rate/concurrency, max instances, transactional counters, and provider caps are containment.
- Return generic public errors with a stable machine code and correlation ID. Do not expose provider prompts, stack traces, bucket paths, signed URLs, tokens, raw user text, or policy internals in logs/error bodies.
- Continue a restrictive CSP and other Hosting security headers. CSP is defense in depth, not the primary XSS defense; keep React text interpolation, avoid unsanitized HTML, and progressively remove `'unsafe-inline'` style allowances if feasible ([OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)).

### Task/worker boundary

- Have Cloud Tasks call a non-browser worker route with an OIDC token from a dedicated least-privilege service account; validate issuer, audience, and authorized principal. Google documents OIDC-authenticated HTTP tasks for Cloud Run ([Cloud Tasks authenticated HTTP sample](https://cloud.google.com/tasks/docs/samples/cloud-tasks-create-http-task-with-token)). App Check is not the trust mechanism for internal task delivery.
- Assume duplicate and delayed deliveries. Make the worker claim an attempt transactionally, store provider submission IDs/checkpoints, make each side effect conditional, and make terminal writes monotonic. Cloud Tasks explicitly provides at-least-once delivery and requires idempotent handlers ([Cloud Tasks overview](https://cloud.google.com/tasks/docs/dual-overview)).
- Set bounded retry attempts/duration with exponential backoff, and distinguish retryable provider/network failures from permanent policy/input failures ([Cloud Tasks retry configuration](https://cloud.google.com/tasks/docs/configure-retry-task)). Use a dead-letter/operational reconciliation path for exhausted or ambiguous submissions so a retry cannot double-charge.
- Keep the worker within the configured request timeout and checkpoint durable state before timeout. Longer Cloud Run timeouts increase the chance of a lost client/platform connection and a reconnect starts a new request, potentially on another instance ([Cloud Run request timeouts](https://cloud.google.com/run/docs/configuring/request-timeout)).
- Keep media private. Authorize ownership before minting a short-lived, read-only signed URL; never log it, store it in durable browser state, or treat obscurity as access control. Anyone possessing a signed URL can use it until expiry ([Cloud Storage signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls)).

## 6. Resilient video-job UX contract

### Server-owned state machine

Use explicit, monotonic states rather than a generic `processing` flag:

```text
draft -> submitting -> queued -> generating -> finalizing -> ready
                      |             |             |
                      +----------> retryable-failure
                      +----------> rejected / failed / expired / cancelled
```

Recommended response fields are `attemptId`, `state`, `createdAt`, `updatedAt`, optional coarse `stage`, optional `retryAfterSeconds`, and a safe terminal `code`/message. A percentage should be shown only if it measures real bounded backend work; model generation usually cannot support a truthful smooth percentage. Prefer stage copy and elapsed-time expectations learned from actual percentiles.

### Submit and resume

1. Generate the attempt ID and persist the pending record before upload.
2. POST once with the attempt ID as an idempotency key; the backend transaction either returns the existing attempt or creates exactly one attempt/credit reservation/task.
3. Treat an interrupted/ambiguous POST as "check this attempt", not "create another". Never charge again because the browser did not receive the response.
4. Deep-link the pending route by attempt ID and reconcile all locally pending attempts on launch/library entry. Server state is canonical; local state is a recovery index.
5. If local Auth resolves to a different anonymous `uid`, do not leak whether another user's attempt exists. Explain that this browser identity changed and offer local recovery/account-link guidance.

### Polling behavior

- Honor server `Retry-After`/`retryAfterSeconds`; otherwise use bounded exponential backoff with jitter. Allow only one in-flight status request per attempt and abort it when the route changes using `AbortController`, which is designed to cancel fetches and response consumption ([MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)).
- Pause frequent polling while the document is hidden/frozen; immediately refresh on `visibilitychange`, `pageshow`, user retry, and likely reconnection. Do not declare success/failure from a local timer.
- Use online/offline events only as hints. MDN warns that an `online` event does not prove this particular website/backend is reachable ([MDN online event](https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event)). The actual authenticated status request is the reachability test.
- Stop automatically on terminal states. For repeated transient failures, show "Still saved; we'll check when you return" plus a manual retry rather than an endless spinner or aggressive retry loop.
- Announce only state changes in a polite live region. Keep the leave/back controls usable during processing and preserve focus when the state rerenders.

### Ready, expiry, and local-storage failure

- Fetch a fresh signed URL only after an authenticated owner check. If it expires, refresh the status endpoint to mint another instead of failing the job or resubmitting generation.
- Continue verifying expected MIME, byte count, and SHA-256 before presenting/saving the file. Also bound maximum accepted bytes before buffering; WebCrypto `digest()` and Blob persistence can temporarily duplicate memory on mobile.
- If IndexedDB persistence fails or quota is low, keep the server result ready for its retention window and offer a direct download/share. Never say "saved" until the local write succeeds.
- Feature-detect file sharing with `navigator.canShare({files})`; call `navigator.share()` directly from a user gesture and retain download as the universal fallback. Web Share requires transient user activation and file support varies ([MDN Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API)).
- Distinguish terminal outcomes in copy: policy rejection (edit input), capacity/provider retryable failure (resume same attempt), spend/credit limit (do not imply retry will work), media expired (regenerate only with explicit consent), and local save failure (download now). Never claim "no credit used" unless the backend state proves it.

## 7. Prioritized implementation and release checks

### P0 — before increasing traffic or spend

- Confirm backend middleware verifies ID token + App Check, requires the expected app ID, and performs per-attempt owner authorization.
- Confirm submission is transactionally idempotent across attempt creation, credit reservation, quota counter, and Cloud Task creation; confirm worker duplicate delivery cannot resubmit the provider or double-charge.
- Add hard payload/pixel/text bounds and transactional per-user/global/provider spend controls.
- Confirm task OIDC audience/principal validation and keep the worker route unavailable to browser credentials.
- Verify anonymous-account cleanup and data/media TTLs match the product promise; explicitly disclose browser-scoped identity and storage.
- Run keyboard, VoiceOver/TalkBack, 320 CSS-pixel reflow, landscape, reduced-motion, and real low/mid-range phone tests.

### P1 — resilience and performance

- Expand the visible/server state contract beyond generic processing; add stage timestamps, bounded jittered polling, visibility/offline resume, and expired-signed-URL refresh.
- Handle IndexedDB quota/eviction and large-Blob memory failure with a download-only path and cleanup UI.
- Measure mobile p75 Core Web Vitals and set bundle/image budgets; eagerly prioritize only the LCP Base Murti and defer inactive art/Firebase routes.
- Test service-worker upgrades across at least two deployed versions, including an offline revisit and a schema migration.
- Replace repeated live-region updates with state-transition announcements and audit touch targets/focus obstruction.

### P2 — maturity

- Offer anonymous-account linking for cross-device/long-term recovery.
- Add privacy-minimized operational dashboards for queue age, stage duration, duplicate delivery, provider ambiguity, signed-URL refresh, auth/App Check rejects, local-save failures, and Core Web Vitals.
- Evaluate App Check replay protection for billable submit only after latency and legitimate-rejection measurements.
- Add carefully bounded prefetching based on measured selection behavior; do not precache the full catalog.

## Source method

Discovery used Brave Search with domain-restricted queries. Every cited claim above links to a primary owner: W3C/WAI for WCAG, MDN or web.dev for browser/platform behavior and web performance, Firebase/Google Cloud documentation for Firebase and GCP contracts, and OWASP for application/API security guidance. Repository-specific observations came from local source inspection; no application code was changed.
