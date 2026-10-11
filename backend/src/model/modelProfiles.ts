import { MODEL_PROFILE_VERSION } from "../devotional-movie/contracts.js";

/** Curated profiles make provider/model swaps explicit, reviewable, and auditable. */
export const GEMINI_DEVOTIONAL_MODEL_PROFILE = {
  version: MODEL_PROFILE_VERSION,
  language: {
    policyModel: "gemini-3.5-flash-lite",
    narrativeModel: "gemini-3.6-flash",
  },
  video: {
    model: "gemini-omni-flash-preview",
  },
} as const;

export const PROVISIONAL_MODEL_PROFILE_VERSION = "provisional-rules-ffmpeg-v1";

// Staging records created before profile-aware routing used this inaccurate shared value.
// Keep the alias until every non-terminal record carrying it has expired.
export const LEGACY_STAGING_MODEL_PROFILE_VERSION = "gemini-fixed-profile-v1";
