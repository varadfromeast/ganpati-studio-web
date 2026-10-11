# AI video monetization: production recommendation

Date: 2026-08-28
Scope: iOS payment model, two free generations, entitlements, quota integrity, refunds, and unit economics.
Evidence: Apple and Firebase/GCP primary documentation plus this repository's measured fal benchmark. This is product/engineering guidance, not legal advice.

## Executive recommendation

1. **Use Apple In-App Purchase through StoreKit 2 for the iOS launch.** Creating and exporting an AI video is digital functionality unlocked in the app, so Apple's default rule is that it must use In-App Purchase (IAP). A Stripe-style external gateway is not a safe global replacement. The US storefront and a limited set of region-specific entitlement programs have exceptions for links to external purchase methods, but those rules are storefront-specific and add policy, reporting, and commercial complexity. They should not be the launch architecture for an India/global app. [App Review Guidelines 3.1.1 and 3.1.1(a)](https://developer.apple.com/app-store/review/guidelines/)
2. **Launch with consumable generation-credit packs, not a subscription.** A generated video is a metered, one-time service with real marginal cost; Apple defines a consumable as a product that is depleted after use. This maps naturally to generation credits. A subscription is best introduced only after retention data shows customers create videos repeatedly throughout the year and the app can promise clear ongoing value. [Apple's IAP product-type definitions](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases)
3. **Grant two lifetime free standard generations per backend account.** Treat this as a server promotion, not an Apple subscription trial. Require Sign in with Apple (backed by Firebase Authentication) before the first paid-cost generation. Anonymous-only quotas are too easy to reset by reinstalling or creating another anonymous identity.
4. **Make LTX 2.5 Pro the standard one-credit route.** The repository benchmark measured approximately **$0.00487** for its six-second clip. Keep Gemini Omni as a premium route until its ambiguous fal `$1/unit` billing can be reconciled against actual billing events. Do not promise a credit price or margin for Omni while the unit conversion is unknown. [Internal benchmark](../artifacts/fal-video-benchmark/2026-08-26-app-bal-ganpati-speaking-wow-02/manifest.json)
5. **The backend, never the device, owns credits and entitlements.** StoreKit supplies signed transactions; the backend verifies and idempotently converts them into ledger entries, then atomically reserves a credit before submitting a provider job.

## Payment-policy decision

Apple says that an app which unlocks features or functionality must use In-App Purchase. This app's paid action is an in-app AI generation, so it fits that rule even if the resulting MP4 can later be shared outside the app. [App Review Guidelines 3.1.1](https://developer.apple.com/app-store/review/guidelines/)

Apple currently permits buttons, external links, or calls to action for other purchase methods in the **United States storefront**, and offers StoreKit external-purchase-link entitlements in certain other regions. Those are exceptions rather than one globally uniform payment path. For an India-first/global release, the lowest-risk implementation is:

- StoreKit 2 IAP inside the iOS app;
- no external card form or Stripe checkout inside the app;
- no web-purchase steering in storefronts where it is prohibited;
- reconsider web checkout later only with storefront-aware UX and a fresh policy/commercial review.

IAP setup also requires an active Paid Apps Agreement, banking/tax setup, matching product identifiers, sandbox/TestFlight tests, server-notification URLs, and review submission. The first IAP must be submitted with a new app version. [Apple's IAP configuration workflow](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases)

## Product model

### Launch model: free allowance plus consumables

Recommended catalog shape:

| Product | StoreKit type | Backend grant | Notes |
|---|---|---:|---|
| Welcome allowance | Server promotion | 2 standard credits | Once per verified backend account; no purchase |
| Small pack | Consumable | 3 standard credits | Lowest paid commitment |
| Value pack | Consumable | 10 standard credits | Better per-video price |
| Premium Omni generation | Consumable | A separate premium credit or multiple standard credits | Do not launch until exact COGS is known |

Consumables are intentionally not represented by `Transaction.currentEntitlements`; Apple describes that sequence as covering non-consumables and subscriptions. Maintain the remaining consumable balance in the server ledger. StoreKit's signed transaction remains the proof that a pack was purchased. [StoreKit `currentEntitlements`](https://developer.apple.com/documentation/storekit/transaction/currententitlements), [StoreKit transaction verification](https://developer.apple.com/documentation/storekit/transaction)

### Why not lead with a subscription

Ganesh Chaturthi use is likely seasonal, and each video has a direct provider cost. A subscription can create poor customer value outside the festival and uncapped cost risk if marketed as unlimited. Apple also requires the paywall to clearly state what the subscription provides. [App Review Guidelines 3.1.2(c)](https://developer.apple.com/app-store/review/guidelines/)

Add a subscription later only if cohort data demonstrates recurring creation. If introduced, make it a **monthly included-credit plan**, not unlimited generation—for example, a defined number of standard credits plus access to premium templates. State the exact monthly allowance and expiry/rollover behavior before purchase. Keep top-up consumables available. Do not silently remove purchased credits when a subscription expires.

## Two-free-generation design

Define the rule precisely: **two lifetime standard generation starts per account**, where a try is consumed only after the backend has durably reserved quota and accepted the job for provider submission.

- Do not consume a try for client validation failures, unsupported images, or a failure before provider submission.
- On an unambiguous provider/infrastructure failure with no usable video, release or compensate the reservation exactly once.
- On a successful generation, consume it even if the user dislikes the creative result; provide a narrowly defined support grant rather than an automatic retry loop.
- On an ambiguous provider timeout, reconcile the existing provider request ID; never resubmit automatically and risk double COGS.
- Require a permanent account before generation. Firebase supports upgrading an anonymous account by linking credentials, but anonymous-account creation is rate-limited and should not be the economic identity for free credits. [Firebase anonymous authentication](https://firebase.google.com/docs/auth/ios/anonymous-auth)

This will reduce casual abuse, not eliminate determined multi-account abuse. Apply velocity limits per account, attested installation, IP risk bucket, and payment/account history. Avoid treating a device identifier as the sole identity because devices are shared, replaced, and reset.

## Fraud-resistant backend design

### Source-of-truth records

Use an append-only ledger rather than a mutable `creditsRemaining` field alone:

- `account`: Firebase UID, stable app-account UUID, risk state;
- `credit_ledger`: grant/debit/reversal entries, amount, reason, product, timestamp;
- `apple_transaction`: unique Apple transaction ID, original transaction ID, product ID, signed JWS hash, environment, app-account token, state;
- `generation`: idempotency key, account, model tier, reservation, provider request ID, status, output, measured COGS;
- `notification`: notification UUID/JWS hash and processing state for deduplication.

Derive the balance from ledger entries or maintain a transactionally checked projection. In one Firestore server transaction: verify eligibility, check balance, create the generation/reservation, and debit exactly once. Firestore transactions are atomic and retry when concurrent edits conflict. [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)

### Purchase flow

1. The signed-in client loads StoreKit products and starts `Product.purchase`, passing an `appAccountToken` that maps to the backend account. Apple returns that UUID in transaction information. [StoreKit `appAccountToken`](https://developer.apple.com/documentation/storekit/transaction/appaccounttoken), [`Product.purchase(options:)`](https://developer.apple.com/documentation/storekit/product/purchase%28options%3A%29)
2. Accept only StoreKit `VerificationResult.verified` transactions on-device, but do not grant spendable server credits based solely on a client Boolean. Send the signed JWS to the backend.
3. The backend verifies the Apple-signed transaction and checks bundle ID, product ID, environment, transaction identity, revocation/refund state, and `appAccountToken` association.
4. Insert the Apple transaction under a uniqueness constraint and append its credit grant in the same idempotent operation. Replayed transactions return the prior result without granting again.
5. Finish the StoreKit transaction only after durable delivery/acknowledgment logic is complete. Keep a startup transaction listener to recover interrupted purchases.
6. Configure App Store Server Notifications V2 for near-real-time refund, subscription, and Family Sharing changes; use the App Store Server API to reconcile transaction history and recover missed notification history. Apple signs server transaction data as JWS. [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi), [IAP configuration and notifications](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases)

### App/backend protection

- Require Firebase Authentication on the generation endpoint.
- Enable Firebase App Check using App Attest on physical iOS devices, monitor first, then enforce. App Check verifies requests are from the authentic app, but Firebase explicitly says it does **not** perform fraud-risk analysis, so it complements rather than replaces quota and account controls. Use the debug provider only for simulator/CI builds. [Firebase App Check with App Attest](https://firebase.google.com/docs/app-check/ios/app-attest-provider)
- Keep fal credentials in backend secret storage; never ship them in the app.
- Make generation workers private. Use dedicated least-privilege Cloud Run service accounts and authenticated service-to-service calls with Google-signed ID tokens. [Cloud Run service-to-service authentication](https://cloud.google.com/run/docs/authenticating/service-to-service), [Cloud Run service identity](https://cloud.google.com/run/docs/configuring/services/service-identity)
- Enforce per-account daily and concurrent-job caps in addition to paid balance. Paid credits should not imply unlimited parallel provider submissions.

## Restore, refunds, and Family Sharing

### Restore

Provide a visible **Restore Purchases** action for restorable products. Apple says non-consumables and auto-renewable subscriptions must be restorable and recommends not automatically invoking a credentials-prompting restore at launch. [Restoring purchased products](https://developer.apple.com/documentation/storekit/restoring-purchased-products)

Consumables are different: Apple defines them as depleted and does not make Family Sharing available for them. The app's server account and ledger must preserve purchased-but-unused credits across reinstall and devices. A restore button can trigger backend reconciliation, but it must not re-grant an already processed consumable transaction. [Apple IAP product types](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases), [Family Sharing eligibility](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/turn-on-family-sharing-for-in-app-purchases)

### Refunds

Handle `REFUND` and `REFUND_REVERSED` notifications idempotently. Apple exposes refund history and may send a `CONSUMPTION_REQUEST`; the backend can respond with whether and how much of the purchase was delivered/consumed to inform Apple's refund decision. [App Store Server API](https://developer.apple.com/documentation/appstoreserverapi), [App Store Server notification types](https://developer.apple.com/documentation/appstoreservernotifications/notificationtype)

Recommended policy:

- if refunded pack credits are unused, revoke those credits;
- if some are used, do not delete completed user videos; bring the ledger negative or restrict new generation pending support/reconciliation;
- if Apple reverses the refund, reinstate the grant exactly once;
- retain provider request IDs and consumption timestamps as auditable evidence.

### Family Sharing

Consumable credit packs cannot use Family Sharing. Auto-renewable subscriptions and non-consumables can, for up to five additional family members, but enabling Family Sharing cannot later be turned off. If a future subscription is family-shareable, decide whether the monthly credit pool belongs to the purchaser or is independently granted to every family member—independent grants can multiply provider COGS sixfold. The safer default is **Family Sharing off** until the economics and shared-ledger behavior are explicitly designed. [Apple Family Sharing configuration](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/turn-on-family-sharing-for-in-app-purchases), [Supporting Family Sharing](https://developer.apple.com/documentation/storekit/supporting-family-sharing-in-your-app)

## Pricing and COGS guardrails

The LTX benchmark's estimated generation cost was about `$0.00487`, while Gemini Omni's fal pricing was presented as `$1/unit` without enough information to convert the run into a defensible clip cost. Therefore:

- use LTX for the two free tries and the standard credit tier;
- do not include Omni in an unlimited or low-priced pack;
- fetch and reconcile actual provider billing before setting Omni's product price;
- record actual cost, model/version, duration, retries, finishing, storage, and egress against every generation;
- introduce a hard model-specific maximum cost and a global daily spend circuit breaker.

For developers accepted into Apple's Small Business Program, Apple documents a 15% commission on paid apps and IAP while eligible; otherwise model the standard applicable proceeds from the current agreement rather than assuming 15%. [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/)

Use this floor for each pack, per storefront:

```text
minimum customer price =
  (expected generation COGS
   + finishing/storage/egress
   + free-trial acquisition allocation
   + refund/support allowance)
  / (developer proceeds rate * target variable-margin complement)
```

App Store Connect supports country-specific price points and reports both customer price and developer proceeds. Set India pricing from the actual INR price/proceeds table rather than converting a US price manually. [IAP and subscription pricing](https://developer.apple.com/help/app-store-connect/reference/pricing-and-availability/in-app-purchase-and-subscriptions-pricing-and-availability)

Do not finalize numeric price points until these are measured:

1. actual Omni charge per successful six-second run;
2. generation failure/compensation rate;
3. average storage and download/egress per retained video;
4. trial-to-paid conversion and free-generation abuse rate;
5. actual App Store proceeds for the selected India price points and tax category.

## Production acceptance checklist

- [ ] Paid Apps Agreement, banking, tax category, and App Store Connect products configured.
- [ ] Two-credit welcome grant is server-side, lifetime, idempotent, and account-bound.
- [ ] StoreKit 2 purchase flow handles verified, unverified, pending/Ask to Buy, cancelled, and failed results.
- [ ] App transaction listener recovers interrupted transactions.
- [ ] Backend verifies JWS, binds `appAccountToken`, deduplicates transaction IDs, and grants atomically.
- [ ] Credit reservation, provider submission, failure compensation, and ambiguous-timeout reconciliation are idempotent.
- [ ] App Store Server Notifications V2 production and sandbox endpoints pass Apple's test notification.
- [ ] Refund and refund-reversal tests pass; consumption data is available.
- [ ] Firebase Auth and App Check enforcement protect generation; simulator uses debug App Check only.
- [ ] LTX and Omni have separate cost ceilings, concurrency caps, and daily spend limits.
- [ ] Restore Purchases and Manage Subscription entry points exist where applicable.
- [ ] Paywall states exact credits, model tier, expected wait, refund/support behavior, and subscription renewal terms if any.
- [ ] StoreKit Configuration tests, sandbox tests, TestFlight purchase tests, reinstall/cross-device tests, replay tests, and concurrent-generation tests pass.
- [ ] App Review notes explain the two free generations, paid credit products, generated-video flow, and reviewer test path.

## Decision

**Ship two free LTX generations followed by StoreKit consumable credit packs. Keep Gemini Omni as an explicitly premium, cost-capped choice only after its exact per-video billing is established. Do not build a general external payment gateway for the iOS launch. Defer subscription work until recurring usage supports it.**

## Implementation status — 2026-08-28

Implemented locally in this repository:

- Release and Debug now use the same authenticated backend seam; the backend URL is an Info.plist/build setting instead of a `#if DEBUG` capability split.
- Enhanced stills use `POST /v1/enhanced-stills`; the OpenAI credential, retry policy, multipart provider call, and PNG validation live on the server.
- LTX 2.5 Pro and fal Gemini Omni are selectable versioned production profiles. Provider prompts request gentle devotional ambience and no longer prohibit dialogue; finished production media must contain an AAC audio stream.
- Paid provider bytes are written immutably to private `provider-raw/` storage, hashed, and recorded before FFmpeg. A finishing crash resumes from that durable object without another provider call.
- A server-side generation economy provides two lifetime welcome credits, an append-only Firestore ledger, idempotent attempt reservations, verified StoreKit consumable grants, transaction deduplication, and idempotent `REFUND`, `REVOKE`, and `REFUND_REVERSED` handling through signed App Store Server Notifications V2.
- StoreKit 2 handles verified, unverified, pending, cancellation, backend delivery, and interrupted unfinished-transaction recovery. A transaction is finished only after the backend acknowledges its durable grant.
- Pending generations and completed videos persist in an on-device library. A user can close the generation sheet, return later, resume status checks, play, and share completed results.
- The reviewed journey is now Choose a Bal Ganesha → Dress locally → Review → create a six-second portrait video. The commitment screen explains audio, blessing overlay, expected wait, privacy, recovery, and the exact one-credit charge.
- In-app privacy information, a themed home surface, a production app icon, bounded client retries, authenticated Firebase/App Check requests, server daily caps, and structured durable attempt records are present.

Still requires external configuration or evidence before App Store submission:

- deploy this backend revision and inject OpenAI/fal/Gemini secrets, Apple root certificates, the App Store environment/app ID, StoreKit product metadata/prices, and Server Notifications URLs;
- choose and enforce production model-specific cost ceilings and concurrency limits from measured provider billing; the current daily guard and account ledger are separate reservations, so a single cross-resource atomic reservation remains desirable;
- add permanent-account upgrade UX before relying on two lifetime credits as a strong anti-abuse boundary;
- add App Store screenshots, privacy-policy/support URLs, review notes, and App Privacy declarations in App Store Connect;
- run Apple test notifications, StoreKit Configuration, sandbox/TestFlight, reinstall/cross-device, concurrency, and a real paid-provider acceptance run;
- complete a signed physical-device build and verify App Attest, background recovery, purchase interruption, video audio/playback, and memory/thermal behavior. Simulator verification is not a substitute.
