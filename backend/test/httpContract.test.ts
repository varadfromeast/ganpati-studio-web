import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import { DevotionalMovieDirector } from "../src/devotional-movie/DevotionalMovieDirector.js";
import { DevotionalMovieJobs } from "../src/devotional-movie/DevotionalMovieJobs.js";
import {
  InMemoryCreationRecordStore,
  InMemoryObjectStore,
  InMemoryTaskQueue,
} from "../src/adapters/InMemoryAdapters.js";
import { sha256 } from "../src/devotional-movie/validation.js";
import type { MobileRequestVerifier, TaskRequestVerifier } from "../src/http/authenticate.js";
import { HttpError } from "../src/devotional-movie/errors.js";
import { testModelModule, testPNG } from "./helpers.js";

describe("HTTP contract", () => {
  let harness: ReturnType<typeof makeApp>;

  beforeEach(() => { harness = makeApp(); });

  it("exposes health on a Cloud Run-safe path", async () => {
    const response = await request(harness.app).get("/health");

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "ok" });
  });

  it("creates, polls, privately processes, and returns a ready result", async () => {
    const attemptId = "550e8400-e29b-41d4-a716-446655440000";
    const artwork = testPNG();
    const creation = await createRequest(harness.app, "owner-a", attemptId, artwork);
    assert.equal(creation.status, 202, JSON.stringify(creation.body));
    assert.equal(creation.headers["retry-after"], "2");
    assert.deepEqual(creation.body, { kind: "processing", attemptId, retryAfterSeconds: 2 });

    const pending = await request(harness.app)
      .get(`/v1/devotional-movies/attempts/${attemptId}`)
      .set(mobileHeaders("owner-a"));
    assert.equal(pending.status, 202);

    const deniedTask = await request(harness.app)
      .post(`/internal/devotional-movies/${attemptId}/process`)
      .set("authorization", "Bearer wrong-task")
      .send({ ownerId: "owner-a" });
    assert.equal(deniedTask.status, 401);

    const processed = await request(harness.app)
      .post(`/internal/devotional-movies/${attemptId}/process`)
      .set("authorization", "Bearer valid-task")
      .send({ ownerId: "owner-a" });
    assert.equal(processed.status, 204);

    const ready = await request(harness.app)
      .get(`/v1/devotional-movies/attempts/${attemptId}`)
      .set(mobileHeaders("owner-a"));
    assert.equal(ready.status, 200);
    assert.equal(ready.body.kind, "ready");
    assert.equal(ready.body.personalizedMessage, "A warm blessing for Asha");
    assert.equal(ready.body.download.mediaType, "video/mp4");
    assert.equal(ready.body.download.durationSeconds, 6);
  });

  it("does not reveal another owner's attempt", async () => {
    const attemptId = "550e8400-e29b-41d4-a716-446655440000";
    await createRequest(harness.app, "owner-a", attemptId, testPNG());

    const response = await request(harness.app)
      .get(`/v1/devotional-movies/attempts/${attemptId}`)
      .set(mobileHeaders("owner-b"));
    assert.equal(response.status, 404);
  });

  it("accepts personalization at the grapheme limits when Devanagari clusters use multiple code units", async () => {
    const cluster = "कि";
    assert.equal(cluster.length, 2);

    const response = await createRequest(
      harness.app,
      "owner-a",
      "550e8400-e29b-41d4-a716-446655440001",
      testPNG(),
      {
        dedication: cluster.repeat(240),
        recipientName: cluster.repeat(80),
        occasion: cluster.repeat(100),
      },
    );

    assert.equal(response.status, 202, JSON.stringify(response.body));
  });

  it("rejects each personalization field when combining-character graphemes exceed its limit", async () => {
    const cluster = "e\u0301";
    assert.equal(cluster.length, 2);

    const dedication = await createRequest(
      harness.app,
      "owner-a",
      "550e8400-e29b-41d4-a716-446655440002",
      testPNG(),
      { dedication: cluster.repeat(241) },
    );
    const recipient = await createRequest(
      harness.app,
      "owner-a",
      "550e8400-e29b-41d4-a716-446655440003",
      testPNG(),
      { recipientName: cluster.repeat(81) },
    );
    const occasion = await createRequest(
      harness.app,
      "owner-a",
      "550e8400-e29b-41d4-a716-446655440004",
      testPNG(),
      { occasion: cluster.repeat(101) },
    );

    assert.equal(dedication.status, 400);
    assert.equal(recipient.status, 400);
    assert.equal(occasion.status, 400);
    assert.equal(dedication.body.error.code, "invalid_metadata");
    assert.equal(recipient.body.error.code, "invalid_metadata");
    assert.equal(occasion.body.error.code, "invalid_metadata");
  });

  it("requires both identity and App Check tokens", async () => {
    const response = await request(harness.app)
      .get("/v1/devotional-movies/attempts/anything")
      .set("authorization", "Bearer owner-a");
    assert.equal(response.status, 403);
  });

  it("routes enhanced stills through the authenticated backend seam", async () => {
    const app = createApp({
      jobs: harness.jobs,
      mobileVerifier: harness.mobileVerifier,
      taskVerifier: harness.taskVerifier,
      enhancedStills: { generate: async () => testPNG() },
    });
    const response = await request(app)
      .post("/v1/enhanced-stills")
      .set(mobileHeaders("owner-a"))
      .attach("source", Buffer.from(testPNG()), { filename: "source.png", contentType: "image/png" })
      .attach("metadata", Buffer.from(JSON.stringify({
        sourceCompositionHash: sha256(testPNG()),
        prompt: "Polish the approved devotional design while preserving all chosen details.",
        invariants: ["preserveFaceAndExpression"],
      })), { filename: "metadata.json", contentType: "application/json" });

    assert.equal(response.status, 200);
    assert.equal(response.headers["content-type"], "image/png");
    assert.deepEqual(response.body, Buffer.from(testPNG()));
  });

  it("rejects an enhanced-still checksum mismatch before generation", async () => {
    let generated = false;
    const app = createApp({
      jobs: harness.jobs,
      mobileVerifier: harness.mobileVerifier,
      taskVerifier: harness.taskVerifier,
      enhancedStills: { generate: async () => { generated = true; return testPNG(); } },
    });
    const response = await request(app)
      .post("/v1/enhanced-stills")
      .set(mobileHeaders("owner-a"))
      .attach("source", Buffer.from(testPNG()), { filename: "source.png", contentType: "image/png" })
      .attach("metadata", Buffer.from(JSON.stringify({
        sourceCompositionHash: "a".repeat(64),
        prompt: "Polish the approved devotional design while preserving all chosen details.",
        invariants: ["preserveFaceAndExpression"],
      })), { filename: "metadata.json", contentType: "application/json" });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, "enhanced_still_digest_mismatch");
    assert.equal(generated, false);
  });
});

function makeApp() {
  const records = new InMemoryCreationRecordStore();
  const objects = new InMemoryObjectStore();
  const tasks = new InMemoryTaskQueue();
  const director = new DevotionalMovieDirector(
    {
      evaluate: async () => ({ decision: "allow" }),
      craft: async () => ({
        personalizedMessage: "May joy and peace fill your home.",
        videoPromptEN: "A soft diya glow moves gently.",
      }),
    },
    {
      generate: async (_input, operationObserved) => {
        await operationObserved("operation-1");
        return { bytes: new Uint8Array([1, 2, 3]) };
      },
      resume: async () => ({ bytes: new Uint8Array([1, 2, 3]) }),
    },
    {
      finish: async ({ video }) => ({
        bytes: video.bytes,
        mediaType: "video/mp4",
        byteCount: video.bytes.byteLength,
        sha256: sha256(video.bytes),
        durationSeconds: 6,
        width: 720,
        height: 1280,
      }),
    },
  );
  const jobs = new DevotionalMovieJobs(records, objects, tasks, testModelModule(director));
  const mobileVerifier: MobileRequestVerifier = {
    verify: async (idToken, appCheck) => {
      if (appCheck !== "valid-app-check") throw new HttpError(403, "invalid_app_check", "Invalid.");
      return { ownerId: idToken };
    },
  };
  const taskVerifier: TaskRequestVerifier = {
    verify: async (authorization) => {
      if (authorization !== "Bearer valid-task") throw new HttpError(401, "invalid_task", "Invalid.");
    },
  };
  return { app: createApp({ jobs, mobileVerifier, taskVerifier }), records, objects, tasks, jobs, mobileVerifier, taskVerifier };
}

function mobileHeaders(ownerId: string) {
  return { authorization: `Bearer ${ownerId}`, "x-firebase-appcheck": "valid-app-check" };
}

async function createRequest(
  app: ReturnType<typeof createApp>,
  ownerId: string,
  attemptId: string,
  artwork: Uint8Array,
  metadataOverrides: Partial<{
    dedication: string;
    recipientName: string;
    occasion: string;
  }> = {},
) {
  const metadata = {
    artworkSHA256: sha256(artwork),
    dedication: "A warm blessing for Asha",
    recipientName: "Asha",
    occasion: "Ganesh Chaturthi",
    localeIdentifier: "en-IN",
    ...metadataOverrides,
  };
  return request(app)
    .post("/v1/devotional-movies")
    .set(mobileHeaders(ownerId))
    .set("idempotency-key", attemptId)
    .attach("artwork", Buffer.from(artwork), { filename: "artwork.png", contentType: "image/png" })
    .attach("metadata", Buffer.from(JSON.stringify(metadata)), {
      filename: "metadata.json",
      contentType: "application/json",
    });
}
