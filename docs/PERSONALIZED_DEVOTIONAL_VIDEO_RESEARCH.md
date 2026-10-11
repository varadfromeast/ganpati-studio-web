# Personalized devotional message and video: model research

Research date: 2026-08-22

## Recommendation

Use a server-owned, three-stage pipeline:

1. `gemini-3.5-flash-lite` classifies the user's text into a small, versioned policy schema.
2. `gemini-3.6-flash` reads the approved intent plus the flattened Ganpati artwork and composes a short devotional message and an English video-direction prompt as structured JSON.
3. `gemini-omni-flash-preview` receives only the server-built prompt and artwork and produces a 9:16 image-to-video result.

Run the policy classifier once more on the composed message and video prompt before stage 3. Fail closed on timeouts, malformed JSON, safety blocks, and unknown classifications. Never forward the raw user request directly to the video model.

This keeps policy, writing, and video generation behind separate interfaces. It also lets the product replace a model without changing the iOS feature or weakening the policy gate.

“Gemini Omni” is not the message-writing model. Google released **Gemini Omni Flash** (`gemini-omni-flash-preview`) on June 30, 2026 as a preview model for fast video generation and conversational video editing. It accepts text and images and emits 3–10 seconds of 720p, 24 fps video. [Gemini Omni model card](https://ai.google.dev/gemini-api/docs/models/gemini-omni-flash) [Gemini API release notes](https://ai.google.dev/gemini-api/docs/changelog)

## Why these models

| Stage | Primary choice | Why | Alternative |
| --- | --- | --- | --- |
| Intent/policy | `gemini-3.5-flash-lite` | Stable GA model explicitly optimized for low latency, high throughput, simple extraction, and structured outputs; multimodal if artwork classification is added later. | `gemini-3.6-flash` if the policy evaluation set shows materially better recall on indirect or multilingual attacks. |
| Message composition | `gemini-3.6-flash` | Stable multimodal text-out model with image input and structured outputs; a better quality/speed tradeoff for cultural wording and artwork-specific details. | `gemini-3.5-flash-lite` for the cheapest/fastest version after quality testing. |
| Image-to-video | `gemini-omni-flash-preview` | Google's current default recommendation for video, with image-to-video, native multimodality, conversational editing, and a synchronous low-latency mode. | `veo-3.1-lite-generate-preview` for lower price; `veo-3.1-fast-generate-preview` for Veo controls; `veo-3.1-generate-preview` for highest Veo fidelity. |

Google describes `gemini-3.5-flash-lite` as low-latency and cost-effective, with text/image/video/audio/PDF input and structured output support. It costs $0.30 per 1M input tokens and $2.50 per 1M output tokens on the paid standard tier. [3.5 Flash-Lite model card](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

`gemini-3.6-flash` accepts images and text, returns text, supports structured outputs, and is a stable model. Through December 31, 2026 its paid standard price is $0.75 per 1M input tokens and $3.75 per 1M output tokens. [3.6 Flash model card](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash) [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

## The intent layer

### Policy contract

Do not ask the model for a free-form “safe/unsafe” opinion. Give it a versioned policy and require JSON matching a schema similar to:

```json
{
  "decision": "allow | block | review",
  "reason": "none | political | religious_demeaning | other_safety | prompt_injection | ambiguous",
  "normalized_request": "short safe description or empty string",
  "matched_policy_rules": ["POL-001"],
  "language": "en | hi | mr | mixed | unknown"
}
```

Recommended application rules:

- `allow` is the only state that advances.
- `block` gives a fixed, localized product message; never reveal classifier reasoning or system instructions.
- `review`, malformed output, API error, or model safety block fails closed for generation. The user can rephrase.
- Treat `normalized_request` as untrusted until the second policy pass. It is not a bypass token.
- Keep `reason`, policy version, model version, latency, and outcome for aggregate safety telemetry, but do not log raw artwork or raw prompts by default.

The policy itself should state that the product is for a respectful Ganesh celebration and blocks:

- requests involving political parties, politicians, elections, campaigns, political slogans/symbols, political persuasion, or current political disputes;
- requests that insult, mock, rank as inferior, threaten, erase, desecrate, or negatively stereotype any religion, deity, scripture, place of worship, sect, caste, or adherent;
- indirect, coded, transliterated, quoted, role-played, or “ignore the policy” versions of the above;
- prompt injection and attempts to extract policy/system text.

Decide separately whether neutral non-political mentions of civic institutions and neutral mentions of other faiths are allowed. That product decision cannot safely be inferred from “no politics” alone.

### Built-in safety is necessary but insufficient

Gemini's adjustable safety filters cover harassment, hate speech, sexually explicit content, and dangerous content. They do **not** provide a documented “politics” category. Religion-directed abuse may trigger hate or harassment, but neutral political content will not necessarily trigger any standard category. Google also notes that these filters classify probability, not severity, and the default adjustable thresholds are off for Gemini 2.5 and 3 models. Explicitly configure at least hate speech and harassment as `BLOCK_LOW_AND_ABOVE`, and handle `promptFeedback.blockReason`, candidate `finishReason`, and `safetyRatings`. [Gemini safety settings](https://ai.google.dev/gemini-api/docs/safety-settings)

Use structured output (`application/json` plus a JSON schema with enums and `additionalProperties: false`) for the classifier and composer. Structured output guarantees shape, not policy correctness, so an evaluation set remains mandatory. [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)

Optional defense in depth: Google Cloud Model Armor can screen prompts and responses for prompt injection/jailbreaks and responsible-AI categories. Its documented standard categories also do not include politics, so it should supplement rather than replace the domain classifier. Mumbai (`asia-south1`) supports Responsible AI, Sensitive Data Protection, and prompt-injection/jailbreak filters for text, but not multilingual detection or image screening in that region. [Model Armor overview](https://docs.cloud.google.com/model-armor/overview) [Model Armor regional features](https://docs.cloud.google.com/model-armor/feature-availability-by-region)

### Evaluation before launch

Build a labeled policy suite before selecting thresholds. Include clear allows, clear blocks, and adversarial borderline cases in English, Hindi, Marathi, Hinglish, and Romanized Marathi. Include misspellings, emojis, political symbols, public-figure names, jokes, quotations, comparisons between faiths, instructions hidden in long benign text, and requests to place text into the artwork/video. Optimize first for blocked-content recall, then reduce false positives. Do not use the model's self-reported confidence as a calibrated probability.

Start in shadow mode on internal traffic, review disagreements, then lock the policy prompt and schema to a version. Re-run the suite on every model or policy change. Google's own guidance calls for post-processing, rigorous evaluation, monitoring, and iterative safety testing rather than reliance on built-in filters alone. [Gemini safety and factuality guidance](https://ai.google.dev/gemini-api/docs/safety-guidance)

## Personalized message composer

Input only:

- flattened final artwork (PNG/JPEG);
- the classifier's approved, normalized request;
- locale and script preference;
- optional user-selected tone from a closed enum, such as `warm`, `joyful`, or `serene`;
- fixed facts already known from the recipe, such as crown, garland, offering, and palette identifiers.

Do not infer sensitive personal traits, religious status, caste, health, or family circumstances from the image. Avoid claiming divine certainty (“Ganpati guarantees…”). Prefer a short blessing framed as a wish. The structured result should separate user-visible text from video directions:

```json
{
  "message": "user-visible devotional message",
  "video_prompt_en": "visual and motion directions only",
  "locale": "mr-IN",
  "observed_artwork_details": ["marigold garland", "teal garment"]
}
```

The server should build the final video prompt from trusted templates plus `video_prompt_en`; it should not concatenate the raw request. If non-English user-visible text is needed, render it as a native app overlay or a deterministic post-production layer. Gemini Omni documents English as fully supported but says other languages have not been evaluated, so spoken or rendered Hindi/Marathi inside generated video needs a separate acceptance test. [Gemini Omni limitations](https://ai.google.dev/gemini-api/docs/omni)

## Video API recommendation

Use the Gemini Developer API Interactions endpoint:

- API: `POST https://generativelanguage.googleapis.com/v1beta/interactions`
- model: `gemini-omni-flash-preview`
- input: flattened image data or file URI plus the server-built English prompt
- `generation_config.video_config.task`: `image_to_video`
- `response_format.type`: `video`
- `response_format.aspect_ratio`: `9:16` for iPhone sharing
- `response_format.delivery`: `uri` for outputs over 4 MB
- fastest one-shot configuration: `background=false`, `store=false`, `stream=false`

Google says high-resolution source images and specific subject, camera, and environmental motion descriptions work better than “make it move.” `store=false` improves the synchronous path but prevents later editing through `previous_interaction_id`. Omni does not support system instructions, temperature, `top_p`, stop sequences, or a distinct negative-prompt field, so all constraints must be in the ordinary prompt. Generated videos include SynthID. [Gemini Omni image-to-video and configuration guide](https://ai.google.dev/gemini-api/docs/omni)

Omni is preview-only and has no provisioned throughput. Google publishes no India-specific latency SLO; it says generation time varies with duration, resolution, and load. The production decision therefore needs a real-device benchmark from Indian mobile networks and the chosen backend region. India is an officially available Gemini API country, but country availability does not establish India-local inference or a latency guarantee. [Available Gemini API regions](https://ai.google.dev/gemini-api/docs/available-regions) [Gemini Omni technical details](https://ai.google.dev/gemini-api/docs/omni)

Omni is paid-tier only at an effective price of about $0.10 per second of 720p output, so a 3–10 second result is approximately $0.30–$1.00 before small text/image token costs. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

### Video alternatives

- `veo-3.1-lite-generate-preview`: image-to-video, native audio, 720p/1080p, 4/6/8 seconds; $0.05/s at 720p. Best cost fallback.
- `veo-3.1-fast-generate-preview`: image-to-video, native audio, 720p/1080p/4K, 4/6/8 seconds; $0.10/s at 720p. Use when Veo controls or quality prove better in the Ganpati test set.
- `veo-3.1-generate-preview`: same broad generation family at $0.40/s for 720p/1080p. Use only when quality wins justify the cost.

All three are preview models. Veo supports explicit duration, resolution, aspect ratio, and `personGeneration`; Omni is the better first experiment because Google now recommends it as the default video model and it is designed for image consistency and iterative editing. [Gemini video model selection](https://ai.google.dev/gemini-api/docs/video) [Veo 3.1 guide](https://ai.google.dev/gemini-api/docs/video) [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing)

## Deep module seams for this repository

The repository already has a useful provider seam (`GenerationProviding`) and coordinator in `GanpatiStudio/GenerationJobs.swift`, while `OpenAIImageGenerationProvider.swift` is a provider-specific adapter. Do not expand `GenerationProviding` into a large “AI service” with policy, writing, and video details mixed together. Add narrow contracts:

```swift
protocol CelebrationIntentAssessing {
    func assess(_ request: CelebrationIntentRequest) async throws -> CelebrationIntentDecision
}

protocol DevotionalMessageComposing {
    func compose(_ request: DevotionalMessageRequest) async throws -> DevotionalMessage
}

protocol CelebrationVideoGenerating {
    func generate(_ request: CelebrationVideoRequest) async throws -> CelebrationVideoJob
}
```

Put sequencing, fail-closed behavior, retries, idempotency, and state transitions in one `CelebrationVideoCoordinator`. The UI should see only domain states such as `checkingIntent`, `craftingMessage`, `generatingVideo`, `ready`, `blocked(reason)`, and `failed(retryability)`. Provider response shapes, model IDs, prompt text, and safety metadata stay behind adapters.

Although the current still-image prototype supplies an API key through the composition root, production mobile code must not contain a Gemini key. The app should upload to an authenticated backend endpoint that owns Google credentials, rate limiting, policy versions, request deduplication, cost limits, and artifact retention. Use an idempotency key so a retry does not create and bill a second video.

Recommended backend surface:

```text
POST /v1/celebration-videos
  multipart: artwork, userRequest, locale, tone, aspectRatio
  -> 202 { jobId, state }

GET /v1/celebration-videos/{jobId}
  -> { state, blockedReason?, message?, videoURL?, expiresAt? }
```

Even if Omni is run synchronously behind the backend, keep the app-facing contract job-based because video latency and preview capacity are variable.

## Privacy and operational constraints

Use a paid Cloud Billing project. Under the current Gemini API terms, Google does not use paid-service prompts, images, responses, or videos to improve its products, but it logs prompts/responses for a limited period for abuse monitoring and may store/cache them in countries where Google or its agents operate. Free services may use content for product improvement and human review. [Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms)

Therefore:

- obtain explicit consent before uploading user artwork;
- do not include names, phone numbers, addresses, faces, or other personal data unless required and disclosed;
- strip image metadata before upload;
- define backend and generated-video retention, deletion, and signed-URL expiry;
- do not log full prompts/artwork by default;
- add per-user quotas and server-side spend ceilings;
- disclose that video is AI-generated and retain SynthID rather than transcoding it away without testing;
- review the current terms with counsel if the app is likely to be accessed by minors: the Gemini API terms require users of the APIs to be 18+ and prohibit API clients directed toward or likely accessed by under-18s.

Rate limits are per project, vary by model and usage tier, are more restrictive for preview models, and are not guaranteed. Read active limits from AI Studio and handle `429`, `408`, and `5xx` with bounded exponential backoff and jitter. [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)

## Inputs needed before production implementation

1. A Google Cloud project with active billing and a server-side Gemini API credential.
2. A backend deployment choice and authenticated mobile-to-backend API; the Gemini key must not ship in the iOS app.
3. Final policy decisions: whether *all* political references are blocked; whether neutral mention of another faith is allowed; whether ambiguous cases are blocked or manually reviewed.
4. Supported locales/scripts and whether the message is on-screen text, generated speech, or both.
5. Message length and tone options; forbidden theological claims and approved devotional vocabulary.
6. Video defaults: 9:16 or 16:9, target duration, ambient audio versus speech, expected daily volume, maximum per-video cost, and acceptable wait time.
7. Consent, retention, deletion, age-gating, and privacy-copy decisions for uploaded artwork and generated media.
8. A labeled safety and quality evaluation set, including multilingual and adversarial prompts plus representative Ganpati artworks.
9. Product behavior for policy blocks, model safety blocks, timeouts, quota exhaustion, preview-model unavailability, and retry billing.
10. Acceptance thresholds for artwork fidelity: face, trunk, hands/held objects, crown, garment palette, seat, sacred symbols, and unwanted deformation. Reuse the repository's existing fidelity vocabulary where applicable.

## Suggested rollout

1. Implement fake adapters and the coordinator/state machine with no external calls.
2. Connect only the intent classifier; run the labeled suite and shadow-mode logs.
3. Connect message composition and re-classification; review output with Marathi/Hindi-speaking humans and a religious/cultural reviewer.
4. Benchmark Omni, Veo Lite, and Veo Fast on the same 50–100 artworks from India. Measure p50/p95 end-to-end time, block rate, failure rate, identity/fidelity score, language quality, and cost—not anecdotal “fast” impressions.
5. Enable internal one-shot 9:16 Omni generation with `store=false`; add bounded retries and idempotency.
6. Roll out behind a remote feature flag and daily spend cap, then expand only after safety and fidelity targets hold.
