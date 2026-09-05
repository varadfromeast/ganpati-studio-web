# Ganpati backend architecture resources

## Knowledge

- [Apple: Authenticating users with Sign in with Apple](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple)
  Explains how the app receives identity credentials and how the backend verifies them. Use for: deciding who owns a generated-video record.
- [IETF HTTPAPI: Idempotency-Key header](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header)
  Primary protocol work describing client-generated keys for safely retrying non-idempotent requests. Use for: preventing duplicate generation.
- [Google Cloud Storage: Signed URLs](https://cloud.google.com/storage/docs/access-control/signed-urls)
  Defines time-limited, cryptographically signed access to a private storage object. Use for: delivering a generated MP4 without making the bucket public.

## Wisdom (Communities)

No community input is needed for the first implementation decision; validate the flow using failure-injection tests before adding infrastructure.
