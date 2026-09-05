# Web release modules

The client and server keep policy behind small interfaces. Names follow the Base Murti, Variant, Design and Asset Pack vocabulary in CONTEXT.md.

- `usePendingVideo(attemptId)` owns request recovery, cancellation, visibility/offline handling, polling backoff, verified downloads and the separation between playback and durable local saving. The page renders its state and invokes retry actions.
- `services/backend.ts` owns credentials, transport deadlines, safe redirects and media integrity. Callers provide a request and optional cancellation signal; they do not manage individual network stages.
- `services/persistence.ts` owns IndexedDB transactions. Completing a video writes its blob and removes only its corresponding pending record atomically. Pending IDs remain stable across upload retries.
- `AttemptLifecycle` owns legal state transitions, worker leases, retry limits and the ambiguous provider-submission rule. Firestore and in-memory adapters execute the same transitions, so tests exercise the production state machine. Firestore applies changes inside transactions; unchanged polls do not write.
- `DevotionalMovieJobs` coordinates the record store, private object storage, durable queue, model module and billable-attempt guard through their interfaces. Provider operation IDs and output checkpoints allow recovery without a second billable submission.
- `stageRuntimePacks` owns the release asset allowlist and integrity checks. `buildServiceWorker` derives cache versions from all deployed content. Artwork remains on-demand; authenticated and cross-origin requests never enter the service-worker cache.

Dependencies vary at existing seams (Firestore/in-memory, production/test model and transport). Avoid creating classes or forwarding wrappers where nothing varies. Test observable behavior across these interfaces, especially failure recovery and transaction invariants.

Production enhanced still generation remains disabled until durable credit, idempotency and spend controls exist. Firebase public identifiers are browser configuration; provider credentials stay exclusively in Secret Manager and the server runtime.
