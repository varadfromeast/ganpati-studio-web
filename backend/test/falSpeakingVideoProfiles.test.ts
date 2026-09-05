import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { VideoInput } from "../src/devotional-movie/contracts.js";
import { FAL_SPEAKING_VIDEO_PROFILES } from "../src/model/falVideoProfiles.js";

const input: VideoInput = {
  sourceArtwork: new Uint8Array([1]),
  trustedPrompt: "Bal Ganpati says exactly: Happy Ganesh Chaturthi.",
  durationSeconds: 6,
  width: 720,
  height: 1280,
};
const imageURL = "https://storage.invalid/bal-ganpati.png";

describe("fal speaking-video benchmark profiles", () => {
  it("binds all seven audited endpoints to a six-second input with native audio", () => {
    assert.equal(FAL_SPEAKING_VIDEO_PROFILES.length, 7);
    assert.equal(new Set(FAL_SPEAKING_VIDEO_PROFILES.map((profile) => profile.version)).size, 7);
    assert.equal(new Set(FAL_SPEAKING_VIDEO_PROFILES.map((profile) => profile.endpointId)).size, 7);
    assert.equal(new Set(FAL_SPEAKING_VIDEO_PROFILES.map((profile) =>
      profile.version.replaceAll(/[^A-Za-z0-9_-]/gu, "_"))).size, 7);
    const inputs = new Map<string, Record<string, unknown>>(
      FAL_SPEAKING_VIDEO_PROFILES.map((profile) => [
        profile.endpointId,
        profile.buildInput(input, imageURL),
      ]),
    );

    assert.deepEqual(inputs.get("google/gemini-omni-flash/image-to-video"), {
      image_url: imageURL,
      prompt: input.trustedPrompt,
      duration: 6,
      aspect_ratio: "9:16",
    });
    assert.equal(inputs.get("xai/grok-imagine-video/v1.5/image-to-video")?.["duration"], 6);
    assert.equal(inputs.get("fal-ai/pixverse/c1/image-to-video")?.["generate_audio_switch"], true);
    assert.equal(inputs.get("lightricks/ltx-2.5/image-to-video/pro")?.["generate_audio"], true);
    assert.equal(inputs.get("alibaba/wan-3.0-prime/image-to-video")?.["audio"], true);
    assert.equal(inputs.get("fal-ai/kling-video/v3/standard/image-to-video")?.["duration"], "6");
    assert.equal(inputs.get("fal-ai/kling-video/v3/standard/image-to-video")?.["generate_audio"], true);
    assert.match(String(inputs.get("fal-ai/kling-video/v3/standard/image-to-video")?.["prompt"]), /happy ganesh chaturthi/u);
    assert.equal(inputs.get("fal-ai/veo3.1/fast/image-to-video")?.["duration"], "6s");
    assert.equal(inputs.get("fal-ai/veo3.1/fast/image-to-video")?.["generate_audio"], true);
  });
});
