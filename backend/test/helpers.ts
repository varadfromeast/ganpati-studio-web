import { canonicalRequestDigest, sha256 } from "../src/devotional-movie/validation.js";
import type { CreationAttempt } from "../src/devotional-movie/contracts.js";
import { DevotionalMovieDirector } from "../src/devotional-movie/DevotionalMovieDirector.js";
import { RoutedDevotionalModelModule } from "../src/model/RoutedDevotionalModelModule.js";

export const TEST_MODEL_PROFILE = "test-model-profile-v1";

export function testModelModule(
  director: DevotionalMovieDirector,
  activeProfileVersion = TEST_MODEL_PROFILE,
) {
  return new RoutedDevotionalModelModule(
    activeProfileVersion,
    new Map([[activeProfileVersion, director]]),
  );
}

export function testPNG(width = 720, height = 1280): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

export function testAttempt(overrides: Partial<CreationAttempt> = {}): CreationAttempt {
  const artwork = overrides.artwork ?? testPNG();
  const metadata = {
    artworkSHA256: overrides.artworkSHA256 ?? sha256(artwork),
    dedication: overrides.dedication ?? "A warm blessing for our family.",
    recipientName: overrides.recipientName ?? "Asha",
    occasion: overrides.occasion ?? "Ganesh Chaturthi",
    localeIdentifier: overrides.localeIdentifier ?? "mr-IN",
  };
  return {
    id: overrides.id ?? "550e8400-e29b-41d4-a716-446655440000",
    requestDigest: overrides.requestDigest ?? canonicalRequestDigest(metadata),
    artwork,
    ...metadata,
  };
}
