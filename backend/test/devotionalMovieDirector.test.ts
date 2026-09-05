import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { DevotionalMovieDirector } from "../src/devotional-movie/DevotionalMovieDirector.js";
import type {
  DevotionalLanguageModel,
  MediaFinisher,
  PolicyDecision,
  VideoGenerator,
} from "../src/devotional-movie/contracts.js";
import { testAttempt } from "./helpers.js";

describe("DevotionalMovieDirector", () => {
  it("runs both gates in order and uses only reviewed motion in the provider prompt", async () => {
    const events: string[] = [];
    const languageModel: DevotionalLanguageModel = {
      evaluate: mock.fn(async (input) => {
        events.push(`policy:${input.stage}`);
        return { decision: "allow" } as const;
      }),
      craft: mock.fn(async () => {
        events.push("narrative");
        return {
          personalizedMessage: "गणपती बाप्पा आशाच्या जीवनात आनंद नांदो.",
          videoPromptEN: "A soft diya glow moves gently behind the unchanged murti.",
        };
      }),
    };
    let providerPrompt = "";
    const video: VideoGenerator = {
      generate: mock.fn(async (input, operationObserved) => {
        events.push("video");
        providerPrompt = input.trustedPrompt;
        await operationObserved("operation-1");
        return { bytes: new Uint8Array([1, 2, 3]) };
      }),
      resume: mock.fn(),
    };
    let finishedMessage = "";
    const finisher = successfulFinisher(events, (message) => { finishedMessage = message; });
    const director = new DevotionalMovieDirector(languageModel, video, finisher);
    const lifecycleEvents: string[] = [];

    const outcome = await director.create(
      testAttempt({ dedication: "USER_RAW_NEVER_COPY_TO_VIDEO_PROVIDER" }),
      {
        beforeSubmission: async () => { lifecycleEvents.push("providerSubmitting"); },
        operationObserved: async (id) => { lifecycleEvents.push(`operation:${id}`); },
        providerOutputObserved: async () => { lifecycleEvents.push("providerOutputPersisted"); },
      },
    );

    assert.equal(outcome.kind, "ready");
    assert.deepEqual(events, [
      "policy:userRequest",
      "narrative",
      "policy:generatedBrief",
      "video",
      "finish",
    ]);
    assert.deepEqual(lifecycleEvents, [
      "providerSubmitting",
      "operation:operation-1",
      "providerOutputPersisted",
    ]);
    assert.equal(providerPrompt.includes("USER_RAW_NEVER_COPY_TO_VIDEO_PROVIDER"), false);
    assert.equal(providerPrompt.includes("Reviewed motion direction"), true);
    assert.equal(finishedMessage, "USER_RAW_NEVER_COPY_TO_VIDEO_PROVIDER");
    assert.equal(outcome.kind === "ready" ? outcome.message : "", "USER_RAW_NEVER_COPY_TO_VIDEO_PROVIDER");
  });

  const blockedCases = [
    ["political request", [{ decision: "block", coarseReason: "politics", userMessage: "No politics." }]],
    [
      "unsafe generated brief",
      [
        { decision: "allow" },
        { decision: "block", coarseReason: "religious_denigration", userMessage: "Not respectful." },
      ],
    ],
  ] satisfies [string, PolicyDecision[]][];
  for (const [name, decisions] of blockedCases) {
    it(`blocks ${name} before paid generation`, async () => {
      const queue = [...decisions];
      const generate = mock.fn<VideoGenerator["generate"]>();
      const video: VideoGenerator = { generate, resume: mock.fn() };
      const director = new DevotionalMovieDirector(
        {
          evaluate: async () => queue.shift() ?? { decision: "review", coarseReason: "uncertain", userMessage: "Blocked." },
          craft: async () => ({
            personalizedMessage: "message",
            videoPromptEN: "motion",
          }),
        },
        video,
        successfulFinisher([]),
      );
      const beforeSubmission = mock.fn(async () => {});

      const outcome = await director.create(testAttempt(), {
        beforeSubmission,
        operationObserved: async () => {},
        providerOutputObserved: async () => {},
      });

      assert.equal(outcome.kind, "rejected");
      assert.equal(beforeSubmission.mock.calls.length, 0);
      assert.equal(generate.mock.calls.length, 0);
    });
  }
});

function successfulFinisher(
  events: string[],
  observeMessage: (message: string) => void = () => {},
): MediaFinisher {
  return {
    finish: async ({ video, personalizedMessage }) => {
      events.push("finish");
      observeMessage(personalizedMessage);
      return {
        bytes: video.bytes,
        mediaType: "video/mp4",
        byteCount: video.bytes.byteLength,
        sha256: "abc",
        durationSeconds: 6,
        width: 720,
        height: 1280,
      };
    },
  };
}
