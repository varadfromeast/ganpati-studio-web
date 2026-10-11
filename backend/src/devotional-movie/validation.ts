import { createHash } from "node:crypto";
import { HttpError } from "./errors.js";
import {
  POLICY_VERSION,
  PRODUCT_VIDEO_PROFILE,
  type CreationAttempt,
} from "./contracts.js";
import { PNGValidationError, validateSourcePNG } from "../media/pngValidation.js";

const MAX_ARTWORK_BYTES = 15 * 1024 * 1024;
const ALLOWED_LOCALES = new Set(["en-IN", "hi-IN", "mr-IN"]);
const GRAPHEME_SEGMENTER = new Intl.Segmenter("und", { granularity: "grapheme" });

export function hasGraphemeLength(value: string, minimum: number, maximum: number): boolean {
  let count = 0;
  for (const _segment of GRAPHEME_SEGMENTER.segment(value)) {
    count += 1;
    if (count > maximum) return false;
  }
  return count >= minimum;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalRequestDigest(input: {
  artworkSHA256: string;
  dedication: string;
  recipientName?: string;
  occasion?: string;
  localeIdentifier: string;
}): string {
  const canonical = JSON.stringify({
    artworkSHA256: input.artworkSHA256,
    dedication: input.dedication.normalize("NFC").trim(),
    recipientName: input.recipientName?.normalize("NFC").trim() ?? null,
    occasion: input.occasion?.normalize("NFC").trim() ?? null,
    localeIdentifier: input.localeIdentifier,
    policyVersion: POLICY_VERSION,
    productVideoProfile: PRODUCT_VIDEO_PROFILE,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function validateAttempt(attempt: CreationAttempt): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attempt.id)) {
    throw new HttpError(400, "invalid_attempt_id", "Idempotency-Key must be a UUID v4.");
  }
  if (attempt.artwork.byteLength === 0 || attempt.artwork.byteLength > MAX_ARTWORK_BYTES) {
    throw new HttpError(413, "artwork_too_large", "Artwork is missing or too large.");
  }
  try {
    validateSourcePNG(attempt.artwork);
  } catch (error) {
    if (error instanceof PNGValidationError && error.failure === "unsupported") {
      throw new HttpError(415, "unsupported_artwork", "Artwork must be a PNG image.");
    }
    if (error instanceof PNGValidationError && error.failure === "dimensions") {
      throw new HttpError(400, "invalid_artwork_dimensions", "Artwork dimensions are invalid.");
    }
    if (error instanceof PNGValidationError) {
      throw new HttpError(400, "invalid_artwork", "Artwork PNG is incomplete or malformed.");
    }
    throw error;
  }
  if (sha256(attempt.artwork) !== attempt.artworkSHA256.toLowerCase()) {
    throw new HttpError(400, "artwork_digest_mismatch", "Artwork checksum does not match.");
  }
  if (
    !hasGraphemeLength(attempt.dedication, 1, 240) ||
    !hasGraphemeLength(attempt.dedication.trim(), 1, 240)
  ) {
    throw new HttpError(400, "invalid_dedication", "Dedication must be between 1 and 240 characters.");
  }
  if (
    !hasGraphemeLength(attempt.recipientName ?? "", 0, 80) ||
    !hasGraphemeLength(attempt.occasion ?? "", 0, 100)
  ) {
    throw new HttpError(400, "invalid_metadata", "Personalization metadata is too long.");
  }
  if (!ALLOWED_LOCALES.has(attempt.localeIdentifier)) {
    throw new HttpError(400, "unsupported_locale", "That locale is not supported.");
  }
  const expected = canonicalRequestDigest(attempt);
  if (attempt.requestDigest !== expected) {
    throw new HttpError(400, "request_digest_mismatch", "Request digest does not match canonical content.");
  }
}
