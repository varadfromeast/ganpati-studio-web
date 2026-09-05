# Personalised speaking video flow

The web client submits the flattened Base Murti artwork and approved dedication to the durable
backend. Both policy gates run before paid generation. The director includes the approved
message verbatim in a speaking prompt and requests expressive character animation and a complete
musical soundtrack. The production profile is `gemini-text-fal-ltx-2.5-pro-speaking-v1`, using
`lightricks/ltx-2.5/image-to-video/pro` with the source image and native audio enabled.

The backend persists the provider operation and raw video for recovery without duplicate paid
submissions. FFmpeg adds the message overlay and normalizes the video while retaining provider
audio. It no longer substitutes synthetic ambience or fades the spoken words. Silent provider
output fails finishing rather than being disguised with a replacement soundtrack.

Structured timing events distinguish request policy, narrative, brief policy, provider generation,
raw persistence, and finishing. Fal status transitions expose queue and processing elapsed time.

## Verified on 2026-09-05

- 85 backend tests passed, including approved-dialogue propagation and native-audio mapping.
- Fresh GanpatiStudio simulator build succeeded, was installed, and launched on iPhone 17 Pro.
- Cloud Run revision `devotional-movies-staging-00021-862` received 100% traffic; health check passed.
- One authorised direct provider run used the production prompt builder and adapter with:
  `take care Varad and happy ganesh chaturthi`.
- Provider processing completed in approximately 25 seconds; upload, generation, and download
  together took 34.577 seconds. Output was 720 × 1280 H.264 with native AAC audio, 6.12 seconds.
- The paid sample bypassed the HTTP/policy/finishing path. It measures provider performance,
  not full web latency. The clip was presented to the user for review; exact transcript and
  lip synchronization were not independently verified.

The application still requests six-second videos. Long dedications may not fit, and exact spoken
wording remains a generative-quality limitation. The sample's camera push-in became tight near
its end. Further paid iterations require user authorization.
