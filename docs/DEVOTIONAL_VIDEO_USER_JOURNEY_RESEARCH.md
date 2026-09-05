# Devotional video user journey: production recommendation

Date: 2026-08-28
Scope: the iPhone journey from locally creating a Bal Ganesha **Design** to receiving, keeping, and sharing a backend-generated devotional video.
Evidence: Apple design, StoreKit, privacy, accessibility, and background-delivery documentation, plus official fal model and queue documentation. Product recommendations are identified as such.

## Executive recommendation

The strongest launch journey is:

```text
Create and dress locally
        ↓
Approve the finished Design
        ↓
Preview the exact still, message, sound promise, wait, and credit cost
        ↓
Sign in / purchase only when generation is requested
        ↓
Backend durably accepts one idempotent job and reserves one credit
        ↓
Job becomes a persistent Library card; the person can leave immediately
        ↓
Backend validates and stores the paid provider result before finishing
        ↓
Ready notification (optional) → local download → play, save, and share
```

Do **not** put a paywall, account gate, notification prompt, provider picker, or AI prompt field in front of the local creative experience. Apple recommends fast, optional onboarding, contextual teaching, postponing nonessential setup, and letting people experience an app before prompting for purchases. [Apple HIG: Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)

The persistent **Library** is part of the core journey, not a later convenience. The generation runs remotely and can outlive the app process; iOS background notifications are not guaranteed, so the app must always be able to reconstruct truth from the backend when reopened. [Apple: Pushing background updates to your app](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app), [fal: Asynchronous inference](https://fal.ai/docs/documentation/model-apis/inference/queue)

## The recommended journey

### 1. Open directly into creation

Use two stable destinations:

- **Create** — the Base Murti and Customization Slots.
- **Library** — pending, ready, failed, and locally downloaded devotional videos.

On first launch, show the Base Murti immediately and place brief teaching beside the first relevant Customization Slot. Any tour is optional and available later in Help. This follows Apple's preference for learning through interaction and context-specific tips instead of a prerequisite tutorial. [Apple HIG: Onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding)

Do not request Photos, notifications, account creation, or payment at launch. Request protected resources only when the person invokes the feature that needs them. [Apple HIG: Privacy](https://developer.apple.com/design/human-interface-guidelines/privacy)

### 2. Keep “Dress me up” immediate and local

The common path remains tactile and reversible:

- select a Customization Slot;
- preview Variants directly on the Base Murti;
- support undo/redo and a clear reset;
- autosave the Design locally;
- never make network availability part of dressing.

Selection feedback should begin immediately, and transitions should be interruptible and respect Reduce Motion. Motion must clarify which Variant changed rather than delay the result. Apple describes motion as a way to convey status, feedback, and instruction, and system behavior must adapt to accessibility settings. [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)

### 3. Add one clear approval checkpoint

When all required Customization Slots are valid, present the finished Design at useful size with two actions:

- primary: **Bring this Design to life**;
- secondary: **Keep editing**.

The approval checkpoint freezes an immutable flattened still for the request. It should not silently submit anything. Preserve the aspect ratio and important artwork rather than cropping to fill an arbitrary frame. [Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)

This is also the right moment for a single contextual tip: “We’ll animate this exact Design. AI motion may vary; you can review everything before using a credit.” The wording sets an honest fidelity expectation without interrupting creation.

### 4. Use a compact creation review, not a provider console

The next sheet should disclose only decisions meaningful to the person:

1. the exact approved still;
2. a small closed set of motion intentions, such as **Warm welcome**, **Joyful celebration**, and **Serene blessing**;
3. the exact on-screen devotional message, if one will be added;
4. the sound contract;
5. portrait duration and quality;
6. expected wait as a range, not a fake exact promise;
7. exact credit cost and balance;
8. a short upload/retention disclosure with a Privacy link.

Keep model names, provider names, prompt syntax, seeds, queue details, and FFmpeg choices behind the product seam. Those choices do not help a person decide what devotional result they want.

The still is the **preview before purchase**. Do not charge for browsing motion intentions or reviewing the message. The final action should be specific — for example, **Create 6-second video · 1 credit** — instead of “Continue.” Apple requires apps to communicate which content requires additional purchase, and credits bought through IAP may not expire. [App Review Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/)

### 5. Make the audio promise unambiguous

The launch product should choose and name one of these contracts:

| Contract | Review copy | Completion requirement |
|---|---|---|
| Animated devotional video | “Includes gentle devotional ambience; no spoken words.” | A decodable, audible track is required. |
| Spoken blessing video | Show the exact spoken line and selected language before submission. | Audible speech matching the approved line is required. |

Do not market a video as “speaking,” a “spoken blessing,” or “with sound” and then accept a silent provider result. Conversely, if generated dialogue is deliberately disabled, say **no spoken words** rather than leaving the absence unexplained.

This is feasible with both shortlisted provider families: LTX 2.5 Pro exposes `generate_audio` and defaults it to `true`, while fal's Gemini Omni image-to-video endpoint explicitly returns video with audio. [fal: LTX 2.5 Pro schema](https://fal.ai/models/lightricks/ltx-2.5/audio-to-video/pro/api), [fal: Gemini Omni image to video](https://fal.ai/models/google/gemini-omni-flash/image-to-video)

**Product recommendation for launch:** use **Animated devotional video** with a deterministic, licensed devotional soundscape added in finishing. Generated dialogue should remain unavailable until Marathi/Hindi/English pronunciation, theological wording, and lip sync pass a representative quality review. This produces a reliable audio promise without pretending that the murti speaks. If the product chooses spoken blessing instead, the exact line becomes part of the immutable paid request and silence or materially different speech is a failed generation.

### 6. Ask for identity and payment at commitment

If a permanent account is needed to protect free uses and preserve credits across devices, ask for it only after the person taps the final create action. Explain the immediate benefit: “Sign in to keep your credits and videos safe.”

If the person has a free use or enough credits, submit without showing a store. If the balance is insufficient, show a focused StoreKit purchase sheet that states:

- number of generation credits;
- localized price;
- that purchased credits do not expire;
- that one accepted generation costs one credit;
- what happens on technical failure;
- Restore/refresh-account help where relevant.

Handle StoreKit `pending` as a durable non-error state — for example, Ask to Buy can complete later, and StoreKit delivers the resulting transaction through `Transaction.updates`. Never submit the provider job until the backend has verified and granted the purchase. [Apple: `Product.PurchaseResult.pending`](https://developer.apple.com/documentation/storekit/product/purchaseresult/pending), [Apple: In-App Purchase](https://developer.apple.com/documentation/storekit/in-app-purchase)

Consumable credits do not appear in `Transaction.currentEntitlements`, so the backend ledger, not a local counter, must preserve their balance. [Apple: `Transaction.currentEntitlements`](https://developer.apple.com/documentation/storekit/transaction/currententitlements)

### 7. Turn submission into a durable Library item immediately

A successful submit means only: the backend durably stored the request, source still, owner, credit reservation, and idempotency key, and returned a job identifier. At that instant:

- insert a Library card;
- show **Queued** or **Creating**;
- let the person dismiss the sheet and keep using the app;
- never require the creation view to remain open.

Use truthful phase labels — **Uploading Design**, **Queued**, **Creating motion**, **Finishing sound and video**, **Ready** — only when the backend actually knows the phase. Do not synthesize percentages from elapsed time. Apple recommends determinate progress only when it can be accurate and warns that misleading progress erodes confidence. [Apple HIG: Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)

Apple also advises letting people do other things while content loads. [Apple HIG: Loading](https://developer.apple.com/design/human-interface-guidelines/loading)

For provider work, fal recommends asynchronous inference: submit to its persistent queue, then poll or receive a webhook. Webhook delivery may retry, so provider request IDs must be handled idempotently. [fal: Asynchronous inference](https://fal.ai/docs/documentation/model-apis/inference/queue), [fal: Webhooks](https://fal.ai/docs/documentation/model-apis/inference/webhooks)

### 8. Offer notification permission only after the first accepted job

After the first job enters the Library, offer a nonblocking choice: **Notify me when it’s ready** / **Not now**. Explain exactly that it is for generation completion. Do not request permission earlier.

Completion is an ordinary active notification, not Time Sensitive. The notification should reveal minimal Lock Screen detail — “Your devotional video is ready” — and deep-link to the matching Library item. Apple requires consent and recommends an in-app notification setting; urgency must be represented honestly. [Apple HIG: Managing notifications](https://developer.apple.com/design/human-interface-guidelines/managing-notifications), [Apple: Asking permission to use notifications](https://developer.apple.com/documentation/usernotifications/asking-permission-to-use-notifications)

APNs is an enhancement, not the source of truth. Silent background notifications can be delayed, throttled, coalesced, or discarded, so foreground refresh and relaunch reconciliation remain mandatory. [Apple: Pushing background updates to your app](https://developer.apple.com/documentation/usernotifications/pushing-background-updates-to-your-app)

### 9. Persist and validate before showing Ready

The backend must copy paid provider output into app-owned private storage **before** FFmpeg or any other finishing step. A temporary provider URL is recovery input, not the user's library artifact.

Before changing the job to **Ready**, validate at minimum:

- expected container and decodable video stream;
- expected duration and dimensions within tolerance;
- an audible audio stream that satisfies the selected sound contract;
- finished MP4 stored in app-owned private storage;
- stable checksum, byte length, and content type;
- model/profile version and provider request ID recorded for support and cost attribution.

If finishing crashes, retry from the app-owned raw provider artifact without paying the provider again. If the provider response is ambiguous, reconcile the existing provider request ID instead of submitting another generation. fal notes that a client timeout can occur while the queued request continues processing, which makes “timeout means retry from scratch” unsafe. [fal: Asynchronous inference](https://fal.ai/docs/documentation/model-apis/inference/queue)

### 10. Make the result screen a review, not an automatic share

Open the ready artifact from the Library. Use user-controlled playback and an obvious sound control; do not surprise people with autoplaying audio. Present:

- **Save Video**;
- **Share**;
- **Create another**;
- the devotional message as selectable text/share caption;
- a subtle **AI-generated** label;
- report/support access for a materially broken result.

Download the final file with a background `URLSession` and move it to durable local storage when complete. Apple background download tasks can continue while the app is suspended and resume the app when the transfer finishes. [Apple: Downloading files in the background](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background)

Keep server retention and local availability distinct in the UI. For example: “Saved on this iPhone” versus “Available to download until 4 September.” Never imply permanent cloud storage if a lifecycle policy will delete it.

## Library state model

Every accepted job must survive termination, reinstall/account restore, network loss, and notification loss. Recommended user-visible states:

| State | User-visible behavior | Credit behavior |
|---|---|---|
| Awaiting purchase | Purchase is pending; no generation submitted. | No debit. |
| Uploading | Source transfer can resume/retry idempotently. | No debit until durable acceptance. |
| Queued | Backend owns the job; safe to leave. | One reservation. |
| Creating | Provider request ID exists. | Reservation remains. |
| Finishing | Raw provider output is app-owned; media is being validated/composed. | Reservation remains. |
| Ready | Play/download/share from the Library. | Reservation is consumed. |
| Needs attention | Recoverable transport/download issue; **Resume** reuses the same job. | No second debit. |
| Couldn’t create | Terminal technical/provider/media failure with plain-language reason. | Reservation reversed exactly once. |
| Not allowed | Policy rejection before paid provider submission. | No debit. |
| Expired remotely | Server copy expired; local copy may remain. | No automatic debit/refund. |

The main menu should surface one compact “In progress” card when any job is active and a “Latest creation” card when one is ready, but **Library** remains the complete history. This staged disclosure gives wayfinding without turning the creation screen into a job dashboard.

## Retry and recovery rules

The word **Retry** must have only one economic meaning: continue or reconcile the same paid attempt whenever possible.

- Upload/status/download network errors: automatic bounded retry and manual **Resume**; never spend another credit.
- App killed or device offline: restore Library state from local persistence, then reconcile with the backend.
- Provider queue timeout: query the recorded provider request; do not resubmit blindly.
- Provider/infrastructure failure with no usable output: reverse the reservation once and offer **Try again**, which creates a new attempt only after the person confirms.
- Silent/corrupt/too-short result: terminal generation failure, not Ready; reverse or compensate once according to the published rule.
- Creative dislike despite a contract-valid result: no automatic refund; provide support/reporting and preserve the result.
- Download URL expired: refresh authorization for the same stored artifact; do not regenerate.

The Library should explain the difference between **Resume** (same attempt, no cost) and **Create again · 1 credit** (new paid attempt).

## Honest credit language

Recommended concise copy:

> A credit is used only after Ganpati Studio safely accepts your Design for video creation. Technical failures return it automatically. A completed video uses one credit even if you choose not to share it. Purchased credits never expire.

Display balance and cost together at the last reversible step. On submit, show a receipt-like state: **1 credit reserved · 4 remaining**. On technical failure: **1 credit returned · 5 available**. Avoid coins, urgency timers, “almost gone” pressure, or unclear bundles.

Apple requires IAP for digital functionality and states that purchased credits may not expire. It also expects the business model and purchases to be understandable to App Review and customers. [App Review Guidelines 3.1 and 3.1.1](https://developer.apple.com/app-store/review/guidelines/)

## Privacy journey

At the review sheet, disclose in plain language:

- the approved Design is uploaded to Ganpati Studio's backend and a named generation provider;
- why it is uploaded;
- how long source and generated media remain on the server;
- whether prompts/media are used for model training under the chosen paid provider terms;
- how to delete a video and the account;
- that removing a local download and deleting the server copy are distinct actions.

Link to an in-app Privacy screen containing the full retention, provider, consent-revocation, and deletion policy. Apple's App Review Guidelines require a privacy policy to identify collection and uses, third parties, retention/deletion, and consent withdrawal. [App Review Guidelines 5.1.1](https://developer.apple.com/app-store/review/guidelines/)

App Store privacy answers must include data transmitted or retained by the app **and its third-party partners**. Artwork, generated video, account ID, purchase history, and usage/diagnostic data need classification based on actual implementation. Data processed only on device is not collected, while off-device data retained beyond servicing the request generally is. [Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/)

If accounts exist, Settings must let every person initiate complete account deletion, including automatically created/guest accounts and associated user-generated images/videos. [Apple: Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

## Accessibility acceptance rules

- Every common task — customize, approve, purchase, inspect progress, play, save, share, retry, and delete — must work with VoiceOver.
- Give each Variant a concise semantic label and selected state; do not rely on color, animation, or artwork alone.
- Give the approved Design and generated result useful descriptions; decorative flourishes are hidden from VoiceOver.
- Announce status changes such as “Video ready” or “Credit returned” with timely, non-disruptive accessibility notifications.
- Use Dynamic Type text styles and reflow the review/paywall/status layouts at accessibility sizes; never truncate cost, wait, failure, or privacy copy.
- Keep primary tap targets at the normal iOS 44 × 44 pt control size and provide adequate spacing.
- Under Reduce Motion, replace large zooms/parallax/celebration loops with short fades while preserving selection and completion feedback.
- Never convey completion or error using sound alone; provide visible text and VoiceOver announcements.

Apple's VoiceOver criteria require all common tasks to work without sighted assistance, concise labels, meaningful media descriptions, correct states, logical navigation, and timely status announcements. [Apple: VoiceOver evaluation criteria](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/voiceover-evaluation-criteria) Dynamic Type layouts must adapt at all sizes and minimize truncation. [Apple HIG: Typography](https://developer.apple.com/design/human-interface-guidelines/typography) Apple recommends testing common tasks with VoiceOver, Dynamic Type, Reduce Motion, and non-color cues. [Apple: Performing accessibility testing](https://developer.apple.com/documentation/accessibility/performing-accessibility-testing-for-your-app)

## Deep-module implications

The journey should cross three deep module interfaces, each hiding substantial behavior:

1. **Design approval module** — returns one immutable approved Design snapshot; hides slot rendering, flattening, metadata stripping, local autosave, and fidelity checks.
2. **Devotional video journey module** — accepts that approved snapshot and returns/observes a small domain state model; hides authentication, purchase gating, credit reservation, idempotency, upload, polling, reconciliation, notifications, and downloads.
3. **Backend generation module** — accepts one durable attempt and drives it to a terminal result; hides policy, provider routing, queue/webhook behavior, raw-output persistence, media validation, finishing, cost telemetry, and compensation.

The **Library is the interface to durable generation state**. SwiftUI should render domain states and actions, not provider states. Provider statuses such as `IN_QUEUE` and `IN_PROGRESS`, StoreKit transaction shapes, HTTP retries, signed URLs, and model identifiers belong behind adapters at internal seams. This produces leverage across the main menu, creation sheet, Library, notification deep links, and relaunch recovery while keeping failure logic local.

## Release acceptance checklist

- [ ] Local dressing and Design approval work without account, network, or purchase.
- [ ] The review sheet shows the exact still, message, sound contract, duration, wait range, credit cost, and privacy summary.
- [ ] “Spoken” is never promised unless the exact reviewed line is audibly present in the validated output.
- [ ] Silent, corrupt, malformed, or too-short provider output never becomes Ready.
- [ ] One idempotency key maps to one backend attempt, one provider request, and at most one debit.
- [ ] The backend durably stores paid provider output before finishing.
- [ ] Every accepted job appears in the Library before the creation sheet is dismissed.
- [ ] Relaunch, reinstall/account recovery, offline/online transitions, and missed APNs all reconcile correctly.
- [ ] Notification permission is contextual, optional, and not required for completion.
- [ ] StoreKit pending/cancelled/unverified/verified/update flows are distinguishable and tested.
- [ ] Purchased credit balance is backend-owned and never expires.
- [ ] Technical failures reverse or compensate exactly once; creative dissatisfaction does not silently generate another billable attempt.
- [ ] Background final-file download persists to a stable local URL before playback/share.
- [ ] Privacy, retention, delete-video, delete-account, and notification controls are available in Settings.
- [ ] VoiceOver, Dynamic Type, Reduce Motion, contrast/non-color status, and large tap targets pass on a physical iPhone.
- [ ] Main menu shows Create, Library, active-job status, balance, Privacy, and Help without exposing providers or prompting purchase before value.

## Decision

Ship the journey as **Create → Approve → Review exact promise and cost → Submit once → Leave safely → Return through Library**.

For the first production release, promise an animated devotional video with reliable ambient/instrumental audio and deterministic on-screen devotional text. Keep generated speech staged until it can satisfy the reviewed script in supported languages. Treat persistence, idempotency, media/audio validation, credit compensation, and the Library as one product contract; without them, a paid asynchronous generation flow is not production-ready.
