import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  benchmarkJSONSaveOptions,
  elapsedMilliseconds,
  estimateCost,
  parseAndMatchCheckpoint,
  parseAndMatchRun,
  type PricingQuote,
} from "../src/experiments/falVideoBenchmarkState.js";
import { falVideoProfile } from "../src/model/falVideoProfiles.js";

const profile = falVideoProfile("gemini-text-fal-ltx-2.5-fast-v1");
const pricing: PricingQuote = {
  unitPriceUSD: 0.00017,
  unit: "compute seconds",
  retrievedAt: "2026-08-26T00:00:00.000Z",
};
const sourceSHA256 = "a".repeat(64);

function runFixture() {
  return {
    kind: "fal-image-to-video-benchmark",
    runId: "run-1",
    startedAt: "2026-08-26T01:00:00.000Z",
    source: {
      localFilename: "ganpati.png",
      objectKey: "experiments/fal-video-benchmark/run-1/source.png",
      sha256: sourceSHA256,
    },
    prompt: "Gentle devotional motion.",
    personalizedMessage: "Happy Ganesh Chaturthi",
    durationSeconds: 6,
    width: 720,
    height: 1280,
    profileCount: 1,
    profiles: [{ profileVersion: profile.version, endpointId: profile.endpointId }],
    audioComparison: "Native audio where supported.",
  };
}

function expectedRun() {
  return {
    runId: "run-1",
    sourceObjectKey: "experiments/fal-video-benchmark/run-1/source.png",
    sourceSHA256,
    prompt: "Gentle devotional motion.",
    personalizedMessage: "Happy Ganesh Chaturthi",
    durationSeconds: 6,
    width: 720,
    height: 1280,
    profiles: [profile],
  };
}

describe("fal video benchmark persisted state", () => {
  it("uses an atomic create-only generation precondition for a new run marker", () => {
    assert.deepEqual(benchmarkJSONSaveOptions(true).preconditionOpts, { ifGenerationMatch: 0 });
    assert.equal("preconditionOpts" in benchmarkJSONSaveOptions(false), false);
  });

  it("accepts an exactly matching run and rejects source or profile identity drift", () => {
    assert.equal(parseAndMatchRun(runFixture(), expectedRun()).runId, "run-1");

    assert.throws(
      () => parseAndMatchRun({
        ...runFixture(),
        source: { ...runFixture().source, sha256: "b".repeat(64) },
      }, expectedRun()),
      /run identity/u,
    );
    assert.throws(
      () => parseAndMatchRun({
        ...runFixture(),
        profiles: [{ profileVersion: profile.version, endpointId: "wrong/endpoint" }],
      }, expectedRun()),
      /run identity/u,
    );
  });

  it("binds a resumable request ID to the exact profile and endpoint", () => {
    const checkpoint = {
      profileVersion: profile.version,
      endpointId: profile.endpointId,
      status: "submitted",
      pricing,
      estimatedCostUSD: null,
      estimatedCostUnavailableReason: "Provider did not report inference time.",
      submittedAt: "2026-08-26T01:00:01.000Z",
      requestId: "request-1",
      firstInProgressAt: "2026-08-26T01:00:03.000Z",
      queueLatencyMilliseconds: 2_000,
    };
    const parsed = parseAndMatchCheckpoint(checkpoint, profile);
    assert.equal(parsed.requestId, "request-1");
    assert.deepEqual(parsed.pricing, pricing);
    assert.throws(
      () => parseAndMatchCheckpoint({ ...checkpoint, endpointId: "wrong/endpoint" }, profile),
      /checkpoint identity/u,
    );
    assert.throws(
      () => parseAndMatchCheckpoint({ ...checkpoint, requestId: undefined }, profile),
      /request ID|Invalid input/u,
    );
  });

  it("produces comparable costs when the billing conversion is known", () => {
    assert.deepEqual(estimateCost({ ...pricing, unit: "videos", unitPriceUSD: 0.02 }, 6), {
      estimatedCostUSD: 0.02,
      estimatedCostUnavailableReason: null,
    });
    assert.deepEqual(estimateCost({ ...pricing, unit: "seconds", unitPriceUSD: 0.05 }, 6), {
      estimatedCostUSD: 0.3,
      estimatedCostUnavailableReason: null,
    });
    assert.deepEqual(estimateCost(pricing, 6, 100), {
      estimatedCostUSD: 0.017,
      estimatedCostUnavailableReason: null,
    });
    assert.deepEqual(estimateCost({ ...pricing, unit: "units" }, 6), {
      estimatedCostUSD: null,
      estimatedCostUnavailableReason: "The endpoint's billed-unit conversion is not defined.",
    });
  });

  it("measures a resumed run from the persisted start rather than process restart", () => {
    assert.equal(
      elapsedMilliseconds("2026-08-26T01:00:00.000Z", new Date("2026-08-26T01:03:00.000Z")),
      180_000,
    );
  });
});
