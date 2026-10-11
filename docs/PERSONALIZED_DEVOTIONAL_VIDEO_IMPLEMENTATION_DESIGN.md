# Personalized devotional video: implementation design

Status: implemented tracer bullet; swappable Gemini/fal.ai video providers; fake staging deployed, production intentionally locked
Date: 2026-08-23
Last verified: 2026-08-31

## Outcome

From one approved final Ganpati artwork, create one six-second portrait MP4 containing a respectful personalized devotional message. Every request passes a custom intent gate before message creation and the generated message/video brief passes the same policy again before video generation.

The first release deliberately uses:

- one asynchronous HTTPS job-creation request that returns `202 Accepted`;
- one status endpoint polled only while the iOS loading screen is visible or after relaunch;
- Firebase Anonymous Authentication and App Check;
- one Cloud Run deployment exposing a public mobile interface and a private Cloud Tasks worker route;
- one Cloud Tasks queue for durable execution after the creation response returns;
- Firestore for durable ownership, idempotency, leases, status, and usage counters;
- one private Google Cloud Storage bucket for short-lived inputs and finished MP4s;
- one recorded model profile per attempt, with swappable video providers and no automatic
  cross-provider fallback;
- no APNs, WebSocket, SSE, background iOS polling, or visible progress percentages.

The extension rule is:

> Provider, authentication, storage, retry, policy, and download changes must not require SwiftUI changes.

## Handoff status

The end-to-end product seam now exists in this repository. `backend/` implements the durable
job contract, Firebase identity/App Check verification, queue OIDC verification, Firestore
state and leases, private GCS publication, two intent gates, the fake and live provider
adapters, deterministic FFmpeg finishing, and provider-operation crash recovery. The iOS app
now submits the immutable approved still through `DevotionalMovieMaking`, polls only while
the creation sheet is visible, verifies and stores the finished MP4 locally, then plays and
shares that local file.

The intent layer is an explicit pre-video boundary. Gate 1 classifies the untrusted dedication,
recipient, occasion, and locale received from iOS. After narrative creation, Gate 2 classifies
the generated personalized message and motion brief. Both fail closed: only `allow` advances;
`block`, `review`, malformed output, timeout, or classifier failure rejects the attempt. The
video credit and daily paid-video slot are reserved only after both gates allow and immediately
before provider submission, so rejected personalization never consumes a video credit.

The safe cloud tracer bullet was deployed on 2026-08-23 as Cloud Run service
`devotional-movies-staging` in `asia-south1`, using `APP_ENV=staging-fake`. It has no model
secret and cannot make a billable model call. Cloud Run and Cloud Tasks are limited to one
concurrent paid work item: the queue dispatches at most one task concurrently. The Cloud Run
container accepts four concurrent HTTP requests so status polling is not starved by that worker,
while the service remains capped at one instance for this fake staging tracer bullet. Production
mode remains code-locked behind both an explicit mode and
`ENABLE_BILLABLE_GENERATION=true`.

The apparent Cloud Run routing failure was a diagnostic-path mistake, not an unavailable
service. [Cloud Run reserves some URL paths, including paths ending in `z`](https://docs.cloud.google.com/run/docs/known-issues); `/healthz` therefore
received a Google Front End `404` before the container. The same response from Google's official
hello image on an unknown `/healthz`, together with normal application JSON responses on `/` and
`/v1/devotional-movies`, isolated the behavior. The backend health route is now `/health`, which
returns `200`. No Cloud Support entitlement is needed. The organization policy audit also
confirmed that no Access Context Manager service perimeter exists.

Verification completed during implementation:

- all 27 backend contract/policy/provider-swap/recovery/spend-guard/media-layout tests pass;
- `npm audit --omit=dev` reports zero vulnerabilities;
- all 161 tests in the full `GanpatiStudio` iOS suite pass;
- Firebase iOS SDK 12.18.0 is integrated through Swift Package Manager, and the signed simulator
  app successfully exchanged Firebase Anonymous Auth and registered App Check debug credentials
  with the real Firebase project and passed both tokens through the deployed backend verifier;
- the authenticated non-billable simulator-to-Cloud-Run journey is verified end to end: a forced
  first-POST timeout retried idempotently, an accepted attempt survived termination and relaunch,
  a forced first signed-download `403` caused a fresh signed-URL fetch, the resulting 185,255-byte
  six-second MP4 played locally, and a local-file share payload was constructed;
- after that success, a new Firebase anonymous identity received `404` for the original identity's
  attempt, verifying live ownership isolation without revealing that the resource exists;
- a guarded live-staging preflight on 2026-08-25 verified the Secret Manager key and all three
  configured model endpoints. The first policy request failed closed because Google reported
  depleted Gemini prepaid credits; no video provider call occurred, no daily slot was reserved,
  and staging was immediately returned to the fake adapter;
- on 2026-08-26, the fal.ai key was stored in Secret Manager as `fal-api-key` and authenticated
  against live catalog metadata without submitting any generation. A server-only fal.ai adapter
  and five audited image-plus-text-to-video profiles were added: cheap LTX preview, LTX 2.5 Fast,
  Wan 2.2 Turbo, Grok Imagine Video, and Seedance 2.0 Fast. No billable fal.ai generation has
  been submitted;
- Cloud Build produced the current image digest
  `sha256:c4067d501dc9fcc5d051ecbfea04220c32ae1afc2215e1ed5a3e0de779e43f64`,
  deployed in non-billable mode as revision `devotional-movies-staging-00014-l45` with 100%
  traffic and no model secret attached;
- on 2026-08-31, a signed-simulator live intent probe submitted a political personalization;
  the client received the safe rejection, Firestore recorded `blocked`, and the record had no
  provider-submission timestamp or provider operation ID. A following allowed probe completed a
  270,023-byte six-second MP4 and re-verified POST retry, termination/relaunch recovery, signed-URL
  refresh, ownership isolation, local playback, and sharing;
- the complete GCP topology is now represented in `backend/infra/terraform`, including APIs,
  service accounts/IAM, Artifact Registry, Cloud Run, Cloud Tasks, Firestore TTL, private GCS,
  Firebase Anonymous Auth, App Check, secret containers, and optional budget alerts;
- Firestore TTL is active and separate one-day input/seven-day movie GCS lifecycle rules are
  applied for staging;
- Cloud Tasks queue `devotional-movie-generation` and its dedicated OIDC caller exist.

### Verified access and resources already available

The following were verified read-only on 2026-08-23:

- active Google Cloud project: `project-d5db8f30-7db5-4b54-925` (`378578536975`), with billing enabled;
- the locally authenticated Google account has project Owner access;
- Cloud Run, Cloud Build, Artifact Registry, Firestore, Cloud Storage, Secret Manager, IAM Credentials, Firebase, Firebase Authentication, Firebase App Check, and Gemini Developer API services are enabled;
- Firestore Native database `(default)` exists in `asia-south1`;
- private GCS bucket `project-d5db8f30-7db5-4b54-925-devotional-movies` exists in `ASIA-SOUTH1`, with uniform bucket-level access and public-access prevention enforced;
- Docker Artifact Registry repository `devotional-movies` exists in `asia-south1`;
- runtime service account `devotional-movie-runtime@project-d5db8f30-7db5-4b54-925.iam.gserviceaccount.com` exists and can use Firestore, manage objects in the one movie bucket, access the Gemini secret, and sign GCS read grants;
- the runtime service account has `roles/firebaseauth.viewer`, the minimum predefined role needed
  by revocation-aware Firebase ID-token verification;
- Secret Manager secret `gemini-developer-api-key` has an enabled version and matches the server API key restricted to `generativelanguage.googleapis.com`;
- Secret Manager secret `fal-api-key` has an enabled staging version; it is not attached to the
  non-billable Cloud Run revision;
- Firebase iOS app `com.varad.ganpatistudio` is registered and active;
- Firebase Anonymous Authentication is enabled;
- Firebase App Check App Attest is registered for the iOS app with a one-hour token TTL;
- a simulator App Check debug token is registered, stored only in macOS Keychain, and referenced
  by the shared Xcode scheme through an environment-variable placeholder;
- the matching `GoogleService-Info.plist` and Firebase Auth/App Check/Core packages are integrated.

### Remaining setup and approvals

These are deliberately outside the completed non-billable tracer bullet:

- Cloud Billing Budget API is enabled and the approved ceiling is ₹100 per India calendar day;
  the request-time hard gate is implemented, while Google's optional monthly Gemini spend cap
  still needs a signed-in Cloud Billing console session because the control is not exposed by the
  installed CLI;
- replace provisional multilingual/cultural copy and policy fixtures with reviewer-approved
  versions;
- decide whether the current project is staging and allocate a separate production project
  before any production deployment;
- attach the selected model secrets only to a guarded live-staging revision. Billable-test
  authorization was granted on 2026-08-25 with the ₹100/day ceiling. Gemini prepaid credit is
  still required for the current policy/narrative adapter, but isolated fal.ai video-profile
  experiments can run without it;
- verify App Attest and real share targets on a signed physical iPhone.

The Firebase CLI is not currently installed locally. It is optional; the implementation can use `gcloud`, Google/Firebase REST interfaces, and official SDKs.

## Design alternatives considered

### Alternative A: synchronous operation

One POST stays open until the video is ready. This is the smallest normal path and gives the fastest foreground result. Alone, it cannot recover safely if the phone loses the response after a paid generation finishes.

### Alternative B: durable job resource

The client creates an attempt UUID, submits it as the `Idempotency-Key` on `POST`, and polls a durable job resource. Cloud Tasks dispatches work and Firestore leases it. This is the strongest crash/disconnect design and is selected despite the additional queue, input storage, polling, and job-state implementation because paid video generation must survive mobile disconnects and Cloud Run restarts.

### Alternative C: iOS backend-for-frontend

Swift sees one `make` operation that returns a local MP4. It hides authentication, idempotency, provider orchestration, signed URLs, verification, and file placement. This is the deepest iOS interface and the easiest to use correctly.

### Selected synthesis

Use Alternative C as the iOS interface and Alternative B as the transport. The backend persists the attempt and source artwork before returning `202`, then enqueues one authenticated Cloud Task. The app polls the status resource only while it is visibly waiting. This makes disconnects and app relaunches ordinary behavior rather than recovery-only exceptions.

This produces one deep module on each tier:

```text
SwiftUI
  |
  v
DevotionalMovieMaking.make(request)
  |
  +-- RemoteDevotionalMovieMaker (HTTP/auth/download adapter)
          |
          v
POST /v1/devotional-movies
  |
  +-- persist attempt + private input
  +-- enqueue one Cloud Task
  +-- return 202
          |
          v
POST /internal/devotional-movies/{attemptId}/process
          |
          v
DevotionalMovieDirector.create(owner, attempt)
  |
  +-- DevotionalLanguageModel intent gate 1
  +-- DevotionalLanguageModel artwork-aware message and motion brief
  +-- intent gate 2
  +-- VideoGenerator image-to-video
  +-- deterministic message overlay
  +-- private publication

iOS GET /v1/devotional-movies/attempts/{attemptId}
  |
  +-- 202 while queued/processing
  +-- 200 with ready/rejected/failed terminal result
```

## Product decisions fixed for the MVP

Unless explicitly changed before implementation:

- source: the user-approved enhanced final still, not the mutable editor preview;
- aspect ratio: 9:16;
- resolution: 720 × 1280;
- duration: six seconds;
- output: MP4, H.264 video, AAC only if ambient audio is present;
- message: short wish/blessing, never a claim of divine certainty;
- message placement: deterministic text overlay in the finished MP4, plus returned separately for the share caption;
- generated speech: disabled;
- video provider: `gemini-omni-flash-preview`;
- policy model: `gemini-3.5-flash-lite` with structured output;
- narrative model: `gemini-3.6-flash` with image input and structured output;
- ambiguous policy result: blocked/fail closed;
- politics: all political requests blocked;
- other religions: neutral mention allowed, denigration/comparative attacks blocked;
- normal delivery: full download before the result screen;
- signed download URL lifetime: 15 minutes;
- no cross-device history guarantee for anonymous users.

Model IDs live together in a named, versioned backend profile and never enter the mobile
interface. Provider APIs are adapters at capability seams, not dependencies of orchestration or
product policy.

## Deep model modules and swappable provider APIs

Every executable model call crosses a small product-capability interface:

- iOS still enhancement crosses `GenerationProviding`; SwiftUI receives it from the app
  composition root and does not construct or name OpenAI;
- policy classification and narrative creation cross one `DevotionalLanguageModel` interface;
- image-to-video generation and operation recovery cross `VideoGenerator`;
- `DevotionalMovieJobs` crosses `DevotionalModelModule`, which records the active profile and
  routes every queued or resumed operation back to the adapter for its persisted profile.

`StructuredDevotionalLanguageModel` is the deep language implementation. It owns both policy
prompts, both strict output schemas, devotional validation, artwork/personalization packaging,
timeouts, and fail-closed semantics. Its internal `StructuredOutputModel` seams independently
accept Gemini, OpenAI, local, or future policy and narrative adapters; both currently use
`GeminiStructuredOutputAdapter`, which translates the provider-neutral request to Gemini
Developer API wire format. A provider change therefore does not duplicate or edit devotional
policy logic, and policy and narrative APIs may move independently.

Provider swaps use a new named profile rather than silently changing a model ID. New attempts
persist that profile version. Old non-terminal attempts keep routing to their recorded adapter,
so a deployment cannot accidentally send an existing provider operation ID to a different API.
Retired profiles must remain registered until their non-terminal operations expire; an unknown
profile fails safely instead of guessing.

## External iOS interface

```swift
struct FinalGanpatiArtwork: Equatable, Sendable {
    let pngData: Data
    let contentHash: String
}

struct DevotionalMovieRequest: Equatable, Sendable {
    let artwork: FinalGanpatiArtwork
    let dedication: String
    let recipientName: String?
    let occasion: String?
    let localeIdentifier: String
}

struct DevotionalMovie: Equatable, Sendable {
    let id: String
    let personalizedMessage: String
    /// App-owned, verified MP4 that remains usable after remote URL expiry.
    let localVideoURL: URL
}

enum DevotionalMovieOutcome: Equatable, Sendable {
    case created(DevotionalMovie)
    case rejected(userMessage: String)
}

protocol DevotionalMovieMaking: Sendable {
    func make(_ request: DevotionalMovieRequest) async throws
        -> DevotionalMovieOutcome
}
```

The caller must not learn:

- Gemini model names or response formats;
- Firebase tokens or App Check tokens;
- attempt/idempotency identifiers;
- provider operation identifiers;
- policy categories or classifier reasoning;
- storage object names;
- signed URLs, expiry refresh, checksums, or download retries.

`RemoteDevotionalMovieMaker` owns that implementation and returns only a local file.

### iOS application state

```swift
enum DevotionalMoviePhase: Equatable {
    case idle
    case creating
    case ready(DevotionalMovie)
    case blocked(String)
    case failed(String)
}
```

Do not expose `classifying`, `uploading`, `generating`, or percentage-complete states. The UI may rotate local loading copy on a timer without claiming backend progress.

### iOS invariants

- One intentional Create tap creates one attempt UUID.
- Transport retries reuse that UUID and the same request bytes.
- Until `202` is received, a timeout/lost response retries the POST; it does not switch to GET on an attempt that may never have been enqueued.
- After `202` is received, the adapter records that the attempt was accepted and uses only the status GET for normal waiting/relaunch recovery.
- A second intentional Create tap creates a new UUID.
- A created outcome always contains a verified, app-owned local MP4.
- The result screen uses the same local URL for `AVPlayer` and `UIActivityViewController`.
- Cancellation stops waiting/downloading; it does not imply backend cancellation.
- Tokens, signed URLs, raw prompts, and artwork bytes are never logged.

## HTTP interface

### Create a durable attempt

```http
POST /v1/devotional-movies
Authorization: Bearer <Firebase ID token>
X-Firebase-AppCheck: <App Check token>
Idempotency-Key: <UUID>
Content-Type: multipart/form-data
```

Multipart parts:

```text
artwork: image/png
metadata: application/json
```

```json
{
  "artworkSHA256": "hex digest",
  "dedication": "A warm blessing for Asha",
  "recipientName": "Asha",
  "occasion": "Ganesh Chaturthi",
  "localeIdentifier": "mr-IN"
}
```

The flattened artwork is the backend's visual authority. Do not send `MurtiRecipe`; coupling the backend to the editor schema provides little leverage because the narrative model already sees the final pixels.

New or already-running attempt:

```http
202 Accepted
Retry-After: 2
```

```json
{
  "kind": "processing",
  "attemptId": "550e8400-e29b-41d4-a716-446655440000",
  "retryAfterSeconds": 2
}
```

The backend must durably write the attempt, publish the input PNG to the private GCS bucket, and enqueue the authenticated Cloud Task before returning `202`. If any of those steps fail, it does not acknowledge the job.

An idempotent POST for an already-terminal attempt may return the same terminal representation as the status endpoint. Reusing an attempt ID with different canonical request content returns `409` and never enqueues work.

### Poll visible work and recover after relaunch

```http
GET /v1/devotional-movies/attempts/{attemptId}
Authorization: Bearer <Firebase ID token>
X-Firebase-AppCheck: <App Check token>
```

Queued or processing:

```http
202 Accepted
Retry-After: 2
```

```json
{
  "kind": "processing",
  "attemptId": "550e8400-e29b-41d4-a716-446655440000",
  "retryAfterSeconds": 2
}
```

Ready:

```http
200 OK
```

```json
{
  "kind": "ready",
  "id": "movie_123",
  "personalizedMessage": "गणपती बाप्पा तुमच्या घरात आनंद आणि शांती नांदो.",
  "download": {
    "url": "https://storage.googleapis.com/...signed-query...",
    "expiresAt": "2026-08-22T18:30:00Z",
    "mediaType": "video/mp4",
    "byteCount": 6382041,
    "sha256": "hex digest",
    "durationSeconds": 6
  }
}
```

Policy rejection is a terminal job representation, not a failed transport:

```http
200 OK
```

```json
{
  "kind": "rejected",
  "code": "devotional_request_not_allowed",
  "message": "Please keep your request devotional and non-political."
}
```

Permanent failures also return `200` with `kind: "failed"`, a stable coarse code, and safe user-facing copy. Provider details never cross the interface. A ready lookup always creates a fresh signed URL, so the same status endpoint also refreshes an expired download grant.

Polling stops when the app leaves the visible creation/status screen. Relaunching with a previously accepted pending attempt resumes polling with the same ID. There is no background iOS polling.

### Private worker route

```http
POST /internal/devotional-movies/{attemptId}/process
Authorization: Bearer <Google-signed Cloud Tasks OIDC token>
Content-Type: application/json

{"ownerId":"firebase-user-id"}
```

Only the queue's dedicated caller identity may invoke this route. The route acquires the Firestore processing lease and calls the director. Cloud Tasks retries transport failures, but the Firestore state machine and provider-submission rules decide whether paid work may be repeated.

### Authentication and authorization

JWT/OIDC is the authentication mechanism on both interfaces:

- The iOS app signs in anonymously with Firebase Authentication. Firebase issues a short-lived signed ID-token JWT. The backend verifies its signature, issuer, audience, expiry, and `sub`, then uses `sub` as `ownerId`.
- The app separately sends a Firebase App Check JWT. The backend verifies it and requires the expected Firebase app ID. Authentication answers “which anonymous user?”; App Check answers “did this request come from an attested Ganpati Studio app?”
- Cloud Tasks calls the private worker route with a Google-issued OIDC token. The backend verifies the expected audience and dedicated queue-caller service-account email.

Do not invent a custom username/password or token issuer. Firebase Authentication already provides JWT issuance, refresh, key rotation, anonymous identity persistence, and later account linking. Replacing it with a home-grown JWT issuer would add security-sensitive implementation without simplifying the mobile interface.

Cloud Run IAM alone does not protect the mixed public/private deployment: the public mobile routes must remain reachable, while the private worker route performs its own strict Google OIDC verification.

### Infrastructure errors

- `400`: malformed metadata;
- `401`: invalid/expired identity token after one refresh attempt;
- `403`: invalid App Check token;
- `404`: no attempt owned by this principal (do not reveal another owner's attempt);
- `409`: idempotency fingerprint mismatch;
- `413`: artwork too large;
- `415`: unsupported artwork/media type;
- `429`: per-user/global quota or concurrency cap;
- `503`: attempt creation could not be durably acknowledged;
- `504`: public request parsing/publication deadline exceeded before enqueue.

Provider messages, prompts, request IDs, and classifier reasoning never cross this interface.

## Backend module interface

```typescript
type CreationAttempt = {
  id: string;
  requestDigest: string;
  artwork: Uint8Array;
  artworkSHA256: string;
  dedication: string;
  recipientName?: string;
  occasion?: string;
  localeIdentifier: string;
};

type CreationOutcome =
  | { kind: "ready"; movie: PublishedMovie }
  | { kind: "rejected"; userMessage: string };

interface DevotionalMovieJobs {
  submit(owner: AuthenticatedPrincipal, attempt: CreationAttempt): Promise<JobSnapshot>;
  process(ownerId: string, attemptId: string): Promise<void>;
  findOwned(ownerId: string, attemptId: string): Promise<JobSnapshot | null>;
}
```

The public HTTP handlers authenticate and parse transport, then call `submit` or `findOwned`. The private Cloud Tasks handler verifies Google OIDC and calls `process`. Handlers must not coordinate Firestore, GCS, the queue, models, storage grants, or idempotency themselves.

`DevotionalMovieDirector.create` remains an internal seam exercised by the job module. It owns
the two intent gates and complete media pipeline. `DevotionalModelModule` owns active/recorded
profile routing. `DevotionalMovieJobs` owns durable submission, queueing, leases, ownership,
terminal state, and fresh download grants.

## Backend implementation

`DevotionalMovieJobs.submit` hides this sequence:

1. Validate byte limit, PNG structure, dimensions, digest, and text lengths.
2. Atomically claim `(ownerId, attemptId, requestDigest)`.
3. If terminal, return the stored outcome; if fingerprint differs, reject conflict.
4. Publish the PNG at a deterministic private GCS input key.
5. Enqueue one deterministically named Cloud Task; treat Cloud Tasks `AlreadyExists` for that exact deterministic task as success.
6. Conditionally mark the attempt queued without overwriting `processing` or a terminal state, then return `processing`.

The queue and Firestore cannot share one transaction. The choreography is therefore deliberately repeatable: deterministic GCS keys, deterministic Cloud Task names, and conditional Firestore transitions make a retried POST safe. The worker may start before `markQueued`; `beginProcessing` may acquire either `accepting` or `queued` only when `inputObjectKey` exists and the caller has a valid queue OIDC token.

`DevotionalMovieJobs.process` acquires a Firestore lease and invokes `DevotionalMovieDirector`, which hides this sequence:

1. Evaluate the raw request with fixed Ganesh-murti policy context and strict JSON schema.
2. Stop on anything except explicit `allow`.
3. Ask the multimodal narrative adapter for structured `message` and `videoPromptEN`.
4. Evaluate the generated message and prompt through the same policy.
5. Build the provider prompt from trusted templates plus reviewed output; never concatenate raw dedication.
6. Atomically record `providerSubmitting` immediately before the paid operation.
7. Generate a six-second portrait video from the artwork and persist any recoverable provider operation ID immediately.
8. Deterministically overlay the personalized message with reviewed fonts and layout.
9. Validate container, codec, duration, dimensions, byte limit, and checksum.
10. Upload the final MP4 into the private GCS bucket.
11. Atomically mark the attempt `ready` with the object key and immutable media metadata.

`findOwned` reads only the caller-owned record. For a ready record it creates a fresh 15-minute signed GET URL; signed URLs are never stored.

### Internal seams

These are real because each has a production adapter and a test adapter:

```typescript
interface IntentClassifier {
  evaluate(input: PolicyInput): Promise<PolicyDecision>;
}

interface NarrativeCrafter {
  craft(input: NarrativeInput): Promise<DevotionalNarrative>;
}

interface VideoGenerator {
  generate(input: VideoInput): Promise<ProviderVideo>;
}

interface CreationRecordStore {
  claim(input: ClaimAttempt): Promise<ClaimResult>;
  markQueued(input: QueuedAttempt): Promise<void>;
  beginProcessing(input: BeginProcessing): Promise<LeaseResult>;
  markProviderSubmitting(input: ProviderSubmittingAttempt): Promise<void>;
  attachProviderOperation(input: ProviderOperationAttempt): Promise<void>;
  complete(input: CompleteAttempt): Promise<void>;
  reject(input: RejectAttempt): Promise<void>;
  fail(input: FailAttempt): Promise<void>;
  findOwned(ownerId: string, attemptId: string): Promise<AttemptRecord | null>;
}

interface PrivateObjectStore {
  publishInput(input: SourceArtwork): Promise<StoredInput>;
  readInput(objectKey: string): Promise<Uint8Array>;
  publish(input: FinishedMovie): Promise<StoredMovie>;
  createReadGrant(objectKey: string, ttlSeconds: number): Promise<DownloadGrant>;
}

interface DurableTaskQueue {
  enqueue(input: ProcessAttemptTask): Promise<void>;
}
```

Message overlay and media validation are local-substitutable implementation details. Keep them inside the director package rather than exposing more external interfaces.

### Firestore records

The attempt collection is the durable job notebook:

```text
devotionalMovieAttempts/{ownerId}_{attemptId}
  ownerId
  attemptId
  requestDigest
  state                 accepting | queued | processing | providerSubmitting | ready | blocked | failed | submissionUnknown
  inputObjectKey
  queueTaskName
  leaseExpiresAt
  providerSubmissionStartedAt
  providerOperationId
  policyVersion
  modelProfileVersion
  personalizedMessage
  outputObjectKey
  mediaType
  byteCount
  sha256
  durationSeconds
  failureCode
  createdAt
  completedAt
  expiresAt
```

The approved initial ceiling is ₹100 per India calendar day. A provider profile is a cost and
quality decision, not just a model name. The audited fal.ai catalog currently lists cheap LTX
preview at US$0.02 per video, Wan 2.2 Turbo at US$0.10 per video, and Grok Imagine at US$0.05
per output second (US$0.30 for six seconds). LTX 2.5 Fast is compute-second billed and Seedance
2.0 Fast uses provider units, so their exact per-clip cost must be read from the live estimate
before each experiment rather than inferred here. Gemini Omni remains a more expensive baseline.
Production starts with one global paid video reservation per India calendar day while real India
latency and cost are measured. Keep transactionally updated counter and reservation
documents in separate small collections rather than scanning attempt history on every submission:

```text
devotionalMovieUsage/{ownerId}_{yyyyMMdd}
  ownerId
  day
  acceptedCount
  updatedAt
  expiresAt

devotionalMovieUsage/global_{yyyyMMdd}
  day
  acceptedCount
  updatedAt
  expiresAt

devotionalMoviePaidReservations/{sha256(ownerId, attemptId)}
  ownerId
  attemptId
  day
  createdAt
  expiresAt
```

The global reservation is acquired before the first model API call, so policy, narrative, and
video costs all share the same hard gate. A policy rejection deliberately consumes the day's
slot. It is idempotent for one attempt and is never released after an ambiguous provider result.
Cloud Tasks dispatch rate plus Cloud Run
maximum instances/concurrency enforce simultaneous paid work. Google Cloud's service spend-cap
budgets currently reset monthly, so the Firestore transaction is the request-time daily backstop.

Never store signed URLs. Generate a fresh URL after ownership verification.

The database stores only small job metadata. Artwork and video bytes never enter Firestore; both live in the one private GCS bucket under separate `inputs/` and `movies/` prefixes with different lifecycle rules.

### Why Firestore is required and a cache is optional

Firebase is a product family; Firestore is its NoSQL document database. Firebase Anonymous Authentication and Firebase App Check are separate products and do not imply that Firebase stores the video.

The asynchronous `202 + polling` contract requires one authoritative durable record for ownership, idempotency, queue acceptance, processing leases, provider-submission ambiguity, and terminal status. Cloud Run memory is instance-local and disappears; a cache such as Redis can be evicted or become stale; GCS object metadata does not provide the transactional claim/lease interface needed to prevent duplicate paid calls. Therefore:

- Firestore is the source of truth and uses transactions for job and usage-counter state changes;
- GCS stores only the large input/output files;
- an in-process or managed cache may be added later only for status-read acceleration;
- cache misses always fall back to Firestore, and cache contents never authorize access or paid work.

For the MVP, visible-screen polling every few seconds should read Firestore directly. Do not provision Memorystore until measurements show a real need.

`requestDigest` is SHA-256 over a canonical encoding of:

- artwork digest;
- dedication, recipient, occasion, and locale;
- policy version;
- product video profile.

Same owner + same attempt + same digest resolves the same operation. Same owner + same attempt + different digest is `409`.

### Provider ambiguity

Exactly-once charging cannot be guaranteed if a provider accepts a paid request and the backend crashes before returning a recoverable provider operation ID, unless that provider supports its own idempotency token.

Immediately before the paid call, atomically move the record to `providerSubmitting`. When the
provider returns a recoverable operation ID, persist it before polling, downloading, or any other
subsequent work. The fal.ai adapter does this immediately after queue submission and resumes by
the stored request ID. Gemini uses the same lifecycle observer for its interaction ID. If the
process loses certainty after entering `providerSubmitting` and there is no recoverable provider
operation/idempotency token, mark the attempt `submissionUnknown` and never automatically
resubmit. Prefer one possibly orphaned charge over an automatic duplicate charge.

Cloud Tasks retry behavior must follow the same rule: return a retryable failure only before paid submission, or when retrying can resume a stored provider operation without creating another charge. A terminal rejection, permanent failure, or `submissionUnknown` result acknowledges the task with success so Cloud Tasks does not repeat it.

## Safety contract

The custom policy is versioned and blocks:

- parties, politicians, elections, campaigns, political slogans/symbols, persuasion, and current political disputes;
- insults, mockery, inferiority claims, threats, desecration, erasure, or negative stereotypes about any religion, deity, scripture, sect, caste, adherent, or place of worship;
- indirect, coded, quoted, role-played, transliterated, or misspelled variants;
- prompt injection and attempts to obtain hidden policy/system instructions.

Rules:

- `allow` is the only advancing decision;
- `block`, `review`, uncertainty, malformed JSON, timeout, and provider safety refusal fail closed;
- output is a strict schema with enums and `additionalProperties: false`;
- raw prompts/artwork are not logged by default;
- only coarse reason, policy/model version, latency, and outcome enter safety telemetry;
- the second policy evaluation is mandatory;
- the personalized message is framed as a wish, not guaranteed divine intervention.

## Personalized message in the shared video

Do not ask the video model to render Marathi/Hindi/English text. Generated typography is unreliable and makes policy verification harder.

Instead:

1. Generate the base video without text.
2. Render the approved message deterministically in the backend.
3. Burn it into the MP4 using bundled reviewed fonts and a safe-area layout.
4. Return the same message separately for accessibility and share captions.

The overlay implementation owns:

- two-line maximum and locale-specific length limits;
- Devanagari shaping and approved font licensing;
- high-contrast backing material;
- top/bottom social-platform safe areas;
- ellipsis/rejection rather than silent overflow;
- H.264/AAC MP4 normalization after composition.

This guarantees that the personalized message survives sharing to any platform accepting the MP4.

## iOS repository changes

### Replace the current tier placement

`GanpatiStudio/DevotionalVideoCreation.swift` currently contains the intent, narrative, and video-provider seams on iOS. Retain the useful one-method idea but move those provider-facing interfaces and `DevotionalVideoDirector` implementation into the backend.

Replace video `Data` with an app-owned local file URL.

### Add

```text
GanpatiStudio/DevotionalMovie.swift
  Domain request, outcome, local movie, one DevotionalMovieMaking interface

GanpatiStudio/RemoteDevotionalMovieMaker.swift
  Firebase/App Check tokens, multipart submission, visible-screen polling/relaunch recovery,
  signed download, digest verification, atomic local publication

GanpatiStudio/DevotionalMovieViewModel.swift
  idle / creating / ready / blocked / failed

GanpatiStudio/DevotionalMovieSheet.swift
  form, loading, VideoPlayer, message, retry, share

GanpatiStudio/LocalMovieLibrary.swift
  application-support paths, atomic moves, cleanup
```

### Integrate

- Add “Create personalized video” after final-still fidelity approval.
- Pass the immutable approved PNG and content hash.
- Inject `RemoteDevotionalMovieMaker` at the app composition root.
- Never construct providers or read secrets in a SwiftUI view.
- Reuse the existing `ActivityShareSheet` wrapper with `[message, localVideoURL]`.
- Until `202` is acknowledged, persist the pending attempt ID/digest plus a local reference to the immutable source artwork and normalized metadata so the exact POST can be retried after relaunch.
- After `202`, persist only the accepted attempt ID/digest and completed local movie metadata; do not persist bearer tokens outside Firebase/Keychain handling.

### Remove or supersede

- iOS `DevotionalIntentClassifying`;
- iOS `DevotionalNarrativeCrafting`;
- iOS `DevotionalVideoGenerating`;
- iOS `DevotionalVideoDirector` orchestration;
- video payloads held as `GeneratedArtifact.data`.

## Backend repository changes

Add a `backend/` directory to this repository unless a separate backend repository is supplied:

```text
backend/
  package.json
  tsconfig.json
  Dockerfile
  src/
    app.ts
    http/
      authenticate.ts
      createDevotionalMovie.ts
      getDevotionalMovieAttempt.ts
      processDevotionalMovieTask.ts
    devotional-movie/
      DevotionalMovieJobs.ts
      DevotionalMovieDirector.ts
      contracts.ts
      policy.ts
      promptProfile.ts
      mediaFinishing.ts
    model/
      StructuredDevotionalLanguageModel.ts
      RoutedDevotionalModelModule.ts
      modelProfiles.ts
      falVideoProfiles.ts
    adapters/
      FirebaseIdentityVerifier.ts
      FirebaseAppCheckVerifier.ts
      GoogleTaskOidcVerifier.ts
      FirestoreCreationRecordStore.ts
      CloudTasksQueue.ts
      GeminiStructuredOutputAdapter.ts
      GeminiOmniVideoGenerator.ts
      FalImageToVideoGenerator.ts
      GoogleCloudObjectStore.ts
  test/
    devotionalMovieDirector.test.ts
    devotionalMovieJobs.test.ts
    httpContract.test.ts
    structuredDevotionalLanguageModel.test.ts
    routedDevotionalModelModule.test.ts
    geminiStructuredOutputAdapter.test.ts
  README.md
```

Use current-LTS Node.js, TypeScript strict mode, a small HTTP framework, schema validation, and the official Google/Firebase SDKs. Deploy one Cloud Run service containing both the public routes and the strictly OIDC-verified private task route. The public creation request needs only enough time to validate, persist input, and enqueue; the Cloud Tasks dispatch deadline must cover the measured generation/finishing path. Set conservative queue dispatch, Cloud Run concurrency, and maximum instances from the approved spend cap.

## Verification design

### Backend interface tests

Test observable behavior through `DevotionalMovieJobs`, `DevotionalMovieDirector.create`, and HTTP:

- safe request invokes both gates in order and produces one published movie;
- political request never invokes narrative/video;
- religious denigration never invokes narrative/video;
- unsafe generated brief never invokes video;
- malformed/uncertain classifier output fails closed;
- raw user text never appears in the final provider prompt;
- concurrent identical attempts produce at most one provider call;
- `202` is returned only after the input and Cloud Task are durably accepted;
- a lost POST response is recovered through the status resource without another paid submission;
- only a valid queue-caller OIDC token can invoke the private worker route;
- retry of ready attempt returns existing result with a fresh URL;
- same ID with changed request returns `409`;
- `ready` appears only after verified storage publication;
- owner A cannot recover owner B's attempt;
- signed URL is not persisted or logged;
- provider ambiguity is not auto-resubmitted;
- a provider/model profile swap leaves existing operations on their recorded adapter;
- an unknown retired profile fails safely rather than guessing an API;
- structured policy/narrative behavior is identical behind a provider-neutral adapter;
- message overlay handles English, Marathi, and Hindi golden fixtures;
- quotas reject before paid calls.

### iOS interface tests

- one tap creates one attempt ID before networking;
- retry and token refresh reuse the attempt ID;
- double tap coalesces rather than generating twice;
- lost POST response resumes status polling, not a new generation;
- expired signed URL refreshes through the same status endpoint;
- checksum mismatch deletes the download and fails safely;
- successful creation returns a local MP4 URL;
- ready UI plays that local URL;
- share sheet receives the same local URL plus message;
- blocked and retryable failures show distinct safe copy;
- relaunch discovers a pending attempt;
- no secrets or provider types enter view state.

### End-to-end verification

- emulator-backed backend tests with fake model adapters;
- staging call with one safe, one political, and one religious-denigration fixture;
- simulator build/install/launch after every app change per `AGENTS.md`;
- physical iPhone test on Indian Wi-Fi and cellular;
- real share-sheet checks with Instagram, WhatsApp, Messages, and another installed target;
- verify the shared file visibly contains the message and plays without the app;
- verify storage objects are private without a signed URL;
- force a lost response and prove only one billed provider request occurs where provider semantics permit.

## Implementation sequence and current state

1. Obtain the remaining product decisions listed below; cloud access itself is already sufficient.
2. Scaffold `backend/` with fake adapters and one `DevotionalMovieJobs` interface test.
3. Implement Firebase ID-token JWT verification, Firebase App Check verification, and Google OIDC verification for the private task route.
4. Implement Firestore claim/idempotency, state transitions, processing leases, ownership reads, and TTL fields.
5. Implement deterministic private GCS input/output keys, lifecycle configuration, media metadata, and fresh signed URL delivery.
6. Enable Cloud Tasks, create the queue/caller identity, and prove that `202` is returned only after durable input publication and task enqueue.
7. Implement the policy schema and fake/recorded intent classifier. Prove the first gate blocks before narrative/video work.
8. Implement the narrative adapter and mandatory second intent gate. Prove raw dedication never enters the final video-provider prompt.
9. Add fake video generation, deterministic message overlay, FFmpeg normalization, and media validation.
10. Deploy a fake-adapter staging Cloud Run revision and exercise enqueue, polling, retry, relaunch, ownership, and signed-URL refresh without billable model calls.
11. After billable-test authorization, connect the live policy and narrative models and run the multilingual adversarial corpus.
12. Connect Omni behind approved queue/spend limits and explicitly handle provider submission ambiguity without automatic paid resubmission.
13. Refactor the iOS seam to return a local file; add Firebase Auth/App Check, submission/polling, checksum verification, playback, and sharing.
14. Perform fresh simulator verification after each iOS change, then physical-iPhone App Attest and share-sheet checks.
15. Collect India latency/cost measurements in staging and obtain explicit production-deployment authorization.

Do not combine live credentials, live paid calls, UI integration, and deployment in one commit. Each tracer bullet should leave the preceding interface tests green.

As of 2026-08-26, steps 2–10, 13, and the simulator portion of step 14 are complete. Firebase
Anonymous Auth plus App Check are verified from the signed simulator through the deployed
backend. The non-billable fake-provider journey covers retry, durable relaunch recovery,
ownership isolation, signed-URL refresh, local MP4 playback, and sharing. Steps 1, 11, the live
provider portion of 12, the physical-device portion of 14, and 15 remain
credit/reviewer/device work. Gemini's live key and endpoints were verified on an isolated guarded
revision, but depleted prepaid credits prevented inference; the service was restored to
non-billable fake staging immediately afterward. The fal.ai key and five image-to-video endpoint
schemas/prices were verified through authenticated metadata calls. The adapter is implemented,
and the first guarded five-model fal.ai benchmark is recorded below.

### 2026-08-26 fal.ai image-to-video benchmark

Run `2026-08-26-app-bal-ganpati-wow-01` used the exact app-supplied Bal Ganpati PNG (SHA-256
`d88ea595d0dd09f8bd1ff41fc66a886c1f7ecc05a0693f747b718b1d23d548d9`). Five provider calls
were submitted concurrently through the backend benchmark runner. Each result was normalized to
six seconds, H.264, 720 x 1280, with `Happy Ganesh Chaturthi` burned into the MP4. Raw provider
outputs and finished videos are private under
`gs://project-d5db8f30-7db5-4b54-925-devotional-movies/experiments/fal-video-benchmark/2026-08-26-app-bal-ganpati-wow-01/`.

| Endpoint | Provider latency | Reported inference | Estimated fal cost | Final audio |
| --- | ---: | ---: | ---: | --- |
| `lightricks/ltx-2.5/image-to-video/fast` | 35.013 s | 28.004 s | $0.00476068 | AAC |
| `fal-ai/ltx-video/image-to-video` | 68.512 s | 14.945 s | $0.02 | silent |
| `xai/grok-imagine-video/image-to-video` | 82.240 s | 65.862 s | $0.30 | AAC |
| `fal-ai/wan/v2.2-a14b/image-to-video/turbo` | 107.241 s | 54.759 s | $0.10 | silent |
| `bytedance/seedance-2.0/fast/image-to-video` | 148.469 s | 140.598 s | unavailable: billed-unit conversion not defined | AAC |

The listed prices are endpoint estimates captured on the run date, not the final fal invoice.
LTX 2.5 Fast was both the lowest comparable estimated cost and the fastest provider completion in
this run. Visual ranking remains a human review decision; a midpoint frame check confirmed the
English greeting rendered legibly in all five outputs. The legacy LTX preview output was visibly
letterboxed and distorted relative to the other candidates, so it should not be selected without
reviewing the full clip.

The experiment also established two production requirements: retain the raw provider MP4 before
temporary fal download URLs expire, and choose the overlay font by locale. The resume path now
re-finishes from durable GCS raw video without submitting another paid request, while atomic run
creation prevents accidental reuse of a paid benchmark run ID.

### 2026-08-26 speaking-video follow-up

Run `2026-08-26-app-bal-ganpati-speaking-wow-02` used the same source SHA-256 and asked seven
newer endpoints to animate Bal Ganpati saying exactly `Happy Ganesh Chaturthi` once in a cute,
warm, youthful devotional voice. All seven paid requests were submitted concurrently exactly once.
Every final file is six seconds, H.264, 720 x 1280, with an AAC audio stream and the greeting
burned into the MP4. Results are private under
`gs://project-d5db8f30-7db5-4b54-925-devotional-movies/experiments/fal-video-benchmark/2026-08-26-app-bal-ganpati-speaking-wow-02/`.

| Endpoint | Provider latency | Reported inference | Estimated fal cost | Final audio |
| --- | ---: | ---: | ---: | --- |
| `lightricks/ltx-2.5/image-to-video/pro` | 30.863 s | 28.649 s | $0.00487033 | AAC stereo |
| `xai/grok-imagine-video/v1.5/image-to-video` | 37.591 s | 35.404 s | $0.06 | AAC stereo |
| `fal-ai/veo3.1/fast/image-to-video` | 47.004 s | 45.235 s | $0.90 | AAC stereo |
| `google/gemini-omni-flash/image-to-video` | 53.857 s | 49.013 s | unavailable: billed-unit conversion not defined | AAC stereo |
| `alibaba/wan-3.0-prime/image-to-video` | 55.087 s | 53.928 s | $0.30 | AAC stereo |
| `fal-ai/kling-video/v3/standard/image-to-video` | 68.499 s | 64.250 s | $0.84 | AAC mono |
| `fal-ai/pixverse/c1/image-to-video` | 70.991 s | 70.533 s | $0.03 | AAC stereo |

Known estimates total $2.13487033, excluding Gemini Omni's ambiguous unit charge. fal balance was
exhausted before the optional speech-to-text QA call, so `audioPresent` proves that sound survived
normalization but does not prove exact transcript adherence. None of these generation schemas has
a deterministic transcript field; full-clip human review must rank voice wording, cuteness,
lip-sync, anatomy, and devotional tone. If exact wording is a production requirement, use reviewed
TTS plus a dedicated lip-sync/audio-mix stage rather than trusting general video prompting alone.

Seven simultaneous FFmpeg finishing operations exceeded the original Cloud Run job resources.
Durable raw MP4s allowed a 4-vCPU/4-GiB recovery with zero additional fal submissions. The runner
now serializes FFmpeg finishing while keeping provider calls parallel, records raw hashes and audio
presence, checks durable raw storage before any resume-time fal request, and preflights all seven
payloads before crossing the paid-call boundary.

### 2026-08-28 production finalists

Human review selected two finalists with different product strengths:

- **LTX 2.5 Pro** (`lightricks/ltx-2.5/image-to-video/pro`) is the standard visual-generation
  candidate. It produced the preferred overall video and had the lowest measured benchmark cost
  and latency. The two free welcome generations and initial paid standard-credit tier should use
  this route.
- **Gemini Omni Flash through fal** (`google/gemini-omni-flash/image-to-video`) is the premium
  voice candidate. Its generated voice was preferred in human review, but fal currently reports
  `$1/unit` without exposing a defensible per-run unit conversion to this project's API key. It
  must remain separately cost-capped and must not be included in an unlimited or low-priced tier
  until the actual billing event for a six-second run is reconciled.

These are two separately selectable end-to-end video routes, not a combined pipeline. Extracting
Gemini audio and laying it over LTX video would require two paid generations, would weaken lip-sync,
and has not been approved or validated. Production promotion therefore requires two explicit,
versioned profiles, per-tier spend limits, and server-owned entitlement checks. The benchmark-only
profiles remain unavailable to public requests until those controls and the release UI are in place.

## What the next agent still needs from the user

No additional project-level Google Cloud or Firebase administrator access is required. The
active Project Owner access was sufficient to build and deploy the non-billable tracer bullet.
Organization-level policy access has now confirmed that no Access Context Manager service
perimeter exists. Google Cloud technical-support access is not required: changing the health
probe from Cloud Run-reserved `/healthz` to `/health` resolved the apparent routing problem.

The user must still provide or confirm these product decisions:

1. **V1 locales:** exact allowed identifiers. Proposed default: `en-IN`, `hi-IN`, and `mr-IN`; treat Hinglish as user text under `en-IN` unless explicitly made a separate product option.
2. **Reviewed copy:** approved devotional message tone/vocabulary and safe rejection/failure messages for each supported language.
3. **Retention:** number of days to retain source PNGs, finished MP4s, and Firestore idempotency/job metadata. Inputs should be much shorter-lived than completed movies.
4. **Usage limits:** approved initial limit is one global billable attempt per India calendar day,
   maximum one concurrent Cloud Task/instance, and a ₹100 daily ceiling.
5. **Privacy/age:** consent text for uploading artwork, deletion language, privacy-policy treatment, and minimum-age position—especially because paid Gemini API terms may affect products likely accessed by minors.
6. **Environment:** confirm that `project-d5db8f30-7db5-4b54-925` is staging, or explicitly designate it as production; authorize creation/use of a separate production project if separation is required.
7. **Reviewers:** identify who approves Marathi/Hindi wording and the cultural/religious policy fixtures, or authorize the agent to use clearly marked provisional copy for staging only.

Backend and iOS tracer-bullet implementation were completed under the 2026-08-23 request;
neither implies permission for live model calls or production deployment.

The user must still give these permissions at the corresponding milestone:

8. **fal.ai selection:** manually review the five completed clips, choose the production profile,
   and set the corresponding concurrency and daily-spend policy. The guarded benchmark used the
   approved app artwork and stayed isolated from the public production path.
9. **Full app live test:** either add enough Gemini AI Studio credit for the current policy and
   narrative calls, or approve implementing another `StructuredOutputModel` adapter so those
   calls are swappable in deployment as well.
10. **Physical-device verification:** access to Apple signing and a physical iPhone when App Attest and real share-sheet behavior are tested.
11. **Production deployment:** explicit authorization after staging latency, safety, cost, privacy, and failure-mode results are reviewed.

No long-lived service-account JSON, API key, or other secret should be committed or placed in the
iOS app. The fal.ai key supplied through chat is now in Secret Manager; rotate it before production
because chat is not an appropriate long-term secret-delivery channel.

## Access not required for the MVP

- APNs keys or push-notification entitlement;
- WebSocket/SSE infrastructure;
- Pub/Sub or a separate worker deployment (Cloud Tasks calling the private route in the same Cloud Run deployment is selected);
- social-network developer accounts;
- public storage bucket access;
- Gemini credentials inside the iOS app;
- a CDN or custom domain;
- a permanent signed URL.

## Decisions already made; do not reopen

- source is the user-approved enhanced final still;
- neutral references to another faith are allowed, while denigration and comparative attacks are blocked;
- the message is deterministically burned into the shared MP4 and also returned as text;
- Firebase Anonymous Auth provides the caller JWT; Firebase is not used as a custom credential database;
- Firestore is the durable NoSQL job/idempotency notebook; it stores metadata only, never PNG or MP4 bytes;
- the one existing private GCS bucket stores both short-lived inputs and completed movies under separate prefixes;
- a cache may later accelerate status reads, but it is never authoritative for ownership, idempotency, leases, provider submission, or terminal state;
- POST returns `202` only after durable input publication and Cloud Task enqueue; the app polls only while visibly waiting;
- the first and second intent gates both run in the backend;
- no billable live-model call or production deployment occurs without explicit authorization.

Everything else in this document is an implementation choice the next agent may execute and verify without reopening the architecture.
