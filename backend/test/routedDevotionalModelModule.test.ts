import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { MediaFinisher, VideoGenerator } from "../src/devotional-movie/contracts.js";
import { DevotionalMovieDirector } from "../src/devotional-movie/DevotionalMovieDirector.js";
import { RoutedDevotionalModelModule } from "../src/model/RoutedDevotionalModelModule.js";

describe("RoutedDevotionalModelModule interface", () => {
  it("resumes an in-flight operation with its recorded adapter after the active profile changes", async () => {
    const oldResume = mock.fn<VideoGenerator["resume"]>(async () => ({
      bytes: new TextEncoder().encode("old-provider"),
    }));
    const newResume = mock.fn<VideoGenerator["resume"]>();
    const module = new RoutedDevotionalModelModule(
      "profile-v2",
      new Map([
        ["profile-v1", director(oldResume)],
        ["profile-v2", director(newResume)],
      ]),
    );

    const outcome = await module.resume(
      "profile-v1",
      "old-operation",
      "Blessings",
      "en-IN",
      lifecycle,
    );

    assert.equal(outcome.kind, "ready");
    assert.equal(oldResume.mock.calls.length, 1);
    assert.equal(newResume.mock.calls.length, 0);
  });

  it("fails safely instead of sending an old operation to an unknown provider", async () => {
    const module = new RoutedDevotionalModelModule(
      "profile-v2",
      new Map([["profile-v2", director(mock.fn<VideoGenerator["resume"]>())]]),
    );

    await assert.rejects(
      module.resume("retired-profile", "operation", "Blessings", "en-IN", lifecycle),
      /unavailable for safe processing/,
    );
  });
});

const lifecycle = {
  beforeSubmission: async () => {},
  operationObserved: async () => {},
  providerOutputObserved: async () => {},
};

function director(resume: VideoGenerator["resume"]): DevotionalMovieDirector {
  const video: VideoGenerator = {
    generate: async () => ({ bytes: new Uint8Array([1]) }),
    resume,
  };
  const finisher: MediaFinisher = {
    finish: async ({ video: providerVideo }) => ({
      bytes: providerVideo.bytes,
      mediaType: "video/mp4",
      byteCount: providerVideo.bytes.byteLength,
      sha256: "hash",
      durationSeconds: 6,
      width: 720,
      height: 1280,
    }),
  };
  return new DevotionalMovieDirector(
    {
      evaluate: async () => ({ decision: "allow" }),
      craft: async () => ({ personalizedMessage: "Blessings", videoPromptEN: "Gentle light" }),
    },
    video,
    finisher,
  );
}
