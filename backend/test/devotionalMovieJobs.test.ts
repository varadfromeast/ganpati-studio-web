import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { DevotionalMovieDirector } from "../src/devotional-movie/DevotionalMovieDirector.js";
import { DevotionalMovieJobs } from "../src/devotional-movie/DevotionalMovieJobs.js";
import {
  InMemoryCreationRecordStore,
  InMemoryObjectStore,
  InMemoryTaskQueue,
} from "../src/adapters/InMemoryAdapters.js";
import type {
  DevotionalModelModule,
  DurableTaskQueue,
  PrivateObjectStore,
  VideoGenerator,
} from "../src/devotional-movie/contracts.js";
import { DailySpendLimitError } from "../src/devotional-movie/errors.js";
import { canonicalRequestDigest } from "../src/devotional-movie/validation.js";
import { testAttempt, testModelModule, testPNG } from "./helpers.js";

describe("DevotionalMovieJobs", () => {
  it("durably publishes input and enqueues a deterministic task before processing", async () => {
    const harness = makeHarness();
    const attempt = testAttempt();
    const [first, second] = await Promise.all([
      harness.jobs.submit({ ownerId: "owner-a" }, attempt),
      harness.jobs.submit({ ownerId: "owner-a" }, attempt),
    ]);

    assert.equal(first.kind, "processing");
    assert.equal(second.kind, "processing");
    assert.equal(harness.objects.objects.has(`inputs/owner-a/${attempt.id}.png`), true);
    assert.equal(harness.tasks.tasks.size, 1);
    assert.equal(
      (await harness.records.findOwned("owner-a", attempt.id))?.modelProfileVersion,
      "test-model-profile-v1",
    );

    const processingResults = await Promise.allSettled([
      harness.jobs.process("owner-a", attempt.id),
      harness.jobs.process("owner-a", attempt.id),
    ]);
    assert.equal(processingResults.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(harness.generate.mock.calls.length, 1);
    const ready = await harness.jobs.findOwned("owner-a", attempt.id);
    assert.equal(ready?.kind, "ready");
  });

  it("returns a fresh read grant for every ready lookup without persisting it", async () => {
    const harness = makeHarness();
    const attempt = testAttempt();
    await harness.jobs.submit({ ownerId: "owner-a" }, attempt);
    await harness.jobs.process("owner-a", attempt.id);

    const first = await harness.jobs.findOwned("owner-a", attempt.id);
    const second = await harness.jobs.findOwned("owner-a", attempt.id);

    assert.equal(first?.kind, "ready");
    assert.equal(second?.kind, "ready");
    if (first?.kind === "ready" && second?.kind === "ready") {
      assert.notEqual(first.download.url, second.download.url);
    }
    const record = await harness.records.findOwned("owner-a", attempt.id);
    assert.equal(JSON.stringify(record).includes("private.invalid"), false);
  });

  it("rejects reuse of an attempt ID with different canonical content", async () => {
    const harness = makeHarness();
    const first = testAttempt();
    await harness.jobs.submit({ ownerId: "owner-a" }, first);
    const changedMetadata = {
      artworkSHA256: first.artworkSHA256,
      dedication: "Changed dedication",
      ...(first.recipientName === undefined ? {} : { recipientName: first.recipientName }),
      ...(first.occasion === undefined ? {} : { occasion: first.occasion }),
      localeIdentifier: first.localeIdentifier,
    };
    const changed = testAttempt({
      dedication: changedMetadata.dedication,
      requestDigest: canonicalRequestDigest(changedMetadata),
    });

    await assert.rejects(
      harness.jobs.submit({ ownerId: "owner-a" }, changed),
      (error: unknown) =>
        typeof error === "object" && error !== null &&
        "status" in error && error.status === 409 &&
        "code" in error && error.code === "idempotency_conflict",
    );
  });

  it("keeps canonical request digests stable across equivalent Unicode normalization", () => {
    const shared = {
      artworkSHA256: "a".repeat(64),
      localeIdentifier: "mr-IN",
    };
    const composed = canonicalRequestDigest({
      ...shared,
      dedication: "é",
      recipientName: "é",
      occasion: "é",
    });
    const decomposedAndPadded = canonicalRequestDigest({
      ...shared,
      dedication: " e\u0301 ",
      recipientName: " e\u0301 ",
      occasion: " e\u0301 ",
    });

    assert.equal(decomposedAndPadded, composed);
  });

  it("enforces grapheme limits again at the durable submission boundary", async () => {
    const cluster = "e\u0301";
    const cases = [
      { field: "dedication", attempt: testAttempt({ dedication: cluster.repeat(241) }), code: "invalid_dedication" },
      { field: "recipientName", attempt: testAttempt({ recipientName: cluster.repeat(81) }), code: "invalid_metadata" },
      { field: "occasion", attempt: testAttempt({ occasion: cluster.repeat(101) }), code: "invalid_metadata" },
    ];

    for (const testCase of cases) {
      const harness = makeHarness();
      await assert.rejects(
        harness.jobs.submit({ ownerId: "owner-a" }, testCase.attempt),
        (error: unknown) =>
          typeof error === "object" && error !== null &&
          "code" in error && error.code === testCase.code,
        testCase.field,
      );
    }
  });

  it("rejects malformed and excessive-pixel PNGs before durable work", async () => {
    const malformed = testPNG();
    malformed.set([0x4e, 0x4f, 0x50, 0x45], 12);
    const cases = [
      { artwork: malformed, code: "invalid_artwork" },
      { artwork: testPNG(4_097, 1), code: "invalid_artwork_dimensions" },
      { artwork: testPNG(3_000, 3_000), code: "invalid_artwork_dimensions" },
    ];

    for (const testCase of cases) {
      const harness = makeHarness();
      await assert.rejects(
        harness.jobs.submit({ ownerId: "owner-a" }, testAttempt({ artwork: testCase.artwork })),
        (error: unknown) =>
          typeof error === "object" && error !== null &&
          "code" in error && error.code === testCase.code,
      );
      assert.equal(harness.tasks.tasks.size, 0);
    }
  });

  it("rejects a devotional artwork checksum mismatch before durable work", async () => {
    const harness = makeHarness();
    await assert.rejects(
      harness.jobs.submit({ ownerId: "owner-a" }, testAttempt({ artworkSHA256: "a".repeat(64) })),
      (error: unknown) =>
        typeof error === "object" && error !== null &&
        "code" in error && error.code === "artwork_digest_mismatch",
    );
    assert.equal(harness.tasks.tasks.size, 0);
  });

  it("does not acknowledge submission when durable enqueue fails", async () => {
    const records = new InMemoryCreationRecordStore();
    const objects = new InMemoryObjectStore();
    const brokenTasks: DurableTaskQueue = { enqueue: async () => { throw new Error("queue unavailable"); } };
    const director = makeDirector({
      generate: mock.fn<VideoGenerator["generate"]>(),
      resume: mock.fn<VideoGenerator["resume"]>(),
    });
    const jobs = new DevotionalMovieJobs(records, objects, brokenTasks, testModelModule(director));

    await assert.rejects(
      jobs.submit({ ownerId: "owner-a" }, testAttempt()),
      /queue unavailable/,
    );
  });

  it("repairs an accepting attempt when enqueue succeeds on retry", async () => {
    const records = new InMemoryCreationRecordStore();
    const objects = new InMemoryObjectStore();
    const durableTasks = new InMemoryTaskQueue();
    let enqueueCalls = 0;
    const flakyTasks: DurableTaskQueue = {
      enqueue: async (input) => {
        enqueueCalls += 1;
        if (enqueueCalls === 1) throw new Error("queue unavailable");
        return durableTasks.enqueue(input);
      },
    };
    const jobs = new DevotionalMovieJobs(
      records,
      objects,
      flakyTasks,
      testModelModule(makeDirector({ generate: mock.fn(), resume: mock.fn() })),
    );
    const attempt = testAttempt();

    await assert.rejects(jobs.submit({ ownerId: "owner-a" }, attempt), /queue unavailable/);
    const recovered = await jobs.submit({ ownerId: "owner-a" }, attempt);

    assert.equal(recovered.kind, "processing");
    assert.equal((await records.findOwned("owner-a", attempt.id))?.state, "queued");
    assert.equal(durableTasks.tasks.size, 1);
  });

  it("does not republish or double-enqueue an already queued duplicate", async () => {
    const records = new InMemoryCreationRecordStore();
    const backingObjects = new InMemoryObjectStore();
    const backingTasks = new InMemoryTaskQueue();
    let inputPublishes = 0;
    let enqueueCalls = 0;
    const objects: PrivateObjectStore = {
      publishInput: async (input) => {
        inputPublishes += 1;
        return backingObjects.publishInput(input);
      },
      readInput: (key) => backingObjects.readInput(key),
      publishProviderOutput: (input) => backingObjects.publishProviderOutput(input),
      readProviderOutput: (key) => backingObjects.readProviderOutput(key),
      publish: (input) => backingObjects.publish(input),
      createReadGrant: (key, ttl) => backingObjects.createReadGrant(key, ttl),
    };
    const tasks: DurableTaskQueue = {
      enqueue: async (input) => {
        enqueueCalls += 1;
        return backingTasks.enqueue(input);
      },
    };
    const jobs = new DevotionalMovieJobs(
      records,
      objects,
      tasks,
      testModelModule(makeDirector({ generate: mock.fn(), resume: mock.fn() })),
    );
    const attempt = testAttempt();

    await jobs.submit({ ownerId: "owner-a" }, attempt);
    await jobs.submit({ ownerId: "owner-a" }, attempt);

    assert.equal(inputPublishes, 1);
    assert.equal(enqueueCalls, 1);
    assert.equal(backingTasks.tasks.size, 1);
  });

  it("repairs a published accepting attempt when the client can only poll after a lost response", async () => {
    const harness = makeHarness();
    const attempt = testAttempt();
    await harness.records.claim("owner-a", attempt, "test-model-profile-v1");
    const input = await harness.objects.publishInput({
      ownerId: "owner-a", attemptId: attempt.id, bytes: attempt.artwork, sha256: attempt.artworkSHA256,
    });
    await harness.records.attachInput("owner-a", attempt.id, input.objectKey);

    assert.equal((await harness.jobs.findOwned("owner-a", attempt.id))?.kind, "processing");
    assert.equal((await harness.records.findOwned("owner-a", attempt.id))?.state, "queued");
    assert.equal(harness.tasks.tasks.size, 1);
    assert.equal(harness.generate.mock.calls.length, 0);
  });

  it("bounds worker restarts even when workers crash without recording an exception", async () => {
    let now = new Date("2026-08-23T12:00:00Z");
    const records = new InMemoryCreationRecordStore(() => now);
    const create = mock.fn<DevotionalModelModule["create"]>(async () => ({
      kind: "rejected", userMessage: "Unexpected fourth worker invocation",
    }));
    const jobs = new DevotionalMovieJobs(records, new InMemoryObjectStore(), new InMemoryTaskQueue(), {
      activeProfileVersion: "test-model-profile-v1", create, resume: mock.fn(), finish: mock.fn(),
    }, undefined, () => now);
    const attempt = testAttempt();
    await jobs.submit({ ownerId: "owner-a" }, attempt);
    for (let crash = 0; crash < 3; crash += 1) {
      assert.equal((await records.beginProcessing("owner-a", attempt.id, 15 * 60)).kind, "acquired");
      now = new Date(now.getTime() + 901_000);
    }

    await jobs.process("owner-a", attempt.id);

    assert.equal(create.mock.calls.length, 0);
    assert.equal((await jobs.findOwned("owner-a", attempt.id))?.kind, "failed");
  });

  it("prevents an expired worker from submitting after another worker has acquired the attempt", async () => {
    let now = new Date("2026-08-23T12:00:00Z");
    const records = new InMemoryCreationRecordStore(() => now);
    const firstGate = deferred();
    const secondGate = deferred();
    const firstStarted = deferred();
    const secondStarted = deferred();
    let calls = 0;
    const generate = mock.fn<VideoGenerator["generate"]>(async (_input, observed) => {
      await observed("op-1");
      return { bytes: new Uint8Array([1, 2, 3]) };
    });
    const director = new DevotionalMovieDirector({
      evaluate: async () => ({ decision: "allow" }),
      craft: async () => {
        calls += 1;
        if (calls === 1) {
          firstStarted.resolve();
          await firstGate.promise;
        } else {
          secondStarted.resolve();
          await secondGate.promise;
        }
        return { personalizedMessage: "A blessing", videoPromptEN: "A soft diya glow." };
      },
    }, { generate, resume: mock.fn() }, { finish: async ({ video }) => ({
      bytes: video.bytes, mediaType: "video/mp4", byteCount: video.bytes.byteLength,
      sha256: "movie-hash", durationSeconds: 6, width: 720, height: 1280,
    }) });
    const jobs = new DevotionalMovieJobs(
      records, new InMemoryObjectStore(), new InMemoryTaskQueue(), testModelModule(director),
      undefined, () => now,
    );
    const attempt = testAttempt();
    await jobs.submit({ ownerId: "owner-a" }, attempt);
    const first = jobs.process("owner-a", attempt.id);
    await firstStarted.promise;
    now = new Date(now.getTime() + 901_000);
    const second = jobs.process("owner-a", attempt.id);
    await secondStarted.promise;
    firstGate.resolve();
    await first;
    const submissionsFromExpiredWorker = generate.mock.calls.length;
    secondGate.resolve();
    await second;

    assert.equal(submissionsFromExpiredWorker, 0);
    assert.equal(generate.mock.calls.length, 1);
    assert.equal((await jobs.findOwned("owner-a", attempt.id))?.kind, "ready");
  });

  it("marks a repeatedly failing worker attempt terminal after bounded retries", async () => {
    const records = new InMemoryCreationRecordStore();
    const objects = new InMemoryObjectStore();
    const tasks = new InMemoryTaskQueue();
    const create = mock.fn<DevotionalModelModule["create"]>(async () => {
      throw new Error("transient worker failure");
    });
    const jobs = new DevotionalMovieJobs(records, objects, tasks, {
      activeProfileVersion: "test-model-profile-v1",
      create,
      resume: mock.fn(),
      finish: mock.fn(),
    });
    const attempt = testAttempt();
    await jobs.submit({ ownerId: "owner-a" }, attempt);

    await assert.rejects(jobs.process("owner-a", attempt.id), /transient worker failure/);
    await assert.rejects(jobs.process("owner-a", attempt.id), /transient worker failure/);
    await jobs.process("owner-a", attempt.id);

    assert.equal(create.mock.calls.length, 3);
    assert.deepEqual(await jobs.findOwned("owner-a", attempt.id), {
      kind: "failed",
      code: "generation_temporarily_unavailable",
      message: "Video creation is temporarily unavailable. Please try again.",
    });
  });

  it("marks a processing lease terminal when it remains stale beyond the retry grace", async () => {
    let now = new Date("2026-08-23T12:00:00Z");
    const records = new InMemoryCreationRecordStore(() => now);
    const objects = new InMemoryObjectStore();
    const jobs = new DevotionalMovieJobs(
      records,
      objects,
      new InMemoryTaskQueue(),
      testModelModule(makeDirector({ generate: mock.fn(), resume: mock.fn() })),
      undefined,
      () => now,
    );
    const attempt = testAttempt();
    await jobs.submit({ ownerId: "owner-a" }, attempt);
    assert.equal((await records.beginProcessing("owner-a", attempt.id, 15 * 60)).kind, "acquired");

    now = new Date(now.getTime() + 25 * 60 * 1000 + 1);

    assert.deepEqual(await jobs.findOwned("owner-a", attempt.id), {
      kind: "failed",
      code: "generation_temporarily_unavailable",
      message: "Video creation is temporarily unavailable. Please try again.",
    });
  });

  it("marks an ambiguous paid submission terminal and never automatically resubmits", async () => {
    const generate = mock.fn<VideoGenerator["generate"]>(async () => { throw new Error("lost response"); });
    const video: VideoGenerator = { generate, resume: mock.fn() };
    const records = new InMemoryCreationRecordStore();
    const objects = new InMemoryObjectStore();
    const tasks = new InMemoryTaskQueue();
    const jobs = new DevotionalMovieJobs(
      records,
      objects,
      tasks,
      testModelModule(makeDirector(video)),
    );
    const attempt = testAttempt();
    await jobs.submit({ ownerId: "owner-a" }, attempt);

    await jobs.process("owner-a", attempt.id);
    await jobs.process("owner-a", attempt.id);

    assert.equal(generate.mock.calls.length, 1);
    assert.deepEqual(await jobs.findOwned("owner-a", attempt.id), {
      kind: "failed",
      code: "provider_submission_unknown",
      message: "Video creation could not be safely resumed. Please create a new video.",
    });
  });

  it("reconciles a hard crash in the provider-submission ambiguity window after lease expiry", async () => {
    let now = new Date("2026-08-23T12:00:00Z");
    const records = new InMemoryCreationRecordStore(() => now);
    const objects = new InMemoryObjectStore();
    const tasks = new InMemoryTaskQueue();
    const generate = mock.fn<VideoGenerator["generate"]>();
    const jobs = new DevotionalMovieJobs(
      records,
      objects,
      tasks,
      testModelModule(makeDirector({ generate, resume: mock.fn() })),
    );
    const attempt = testAttempt();
    await jobs.submit({ ownerId: "owner-a" }, attempt);
    const lease = await records.beginProcessing("owner-a", attempt.id, 15 * 60);
    assert.equal(lease.kind, "acquired");
    await records.markProviderSubmitting("owner-a", attempt.id, "Approved blessing");

    now = new Date(now.getTime() + 901_000);
    await jobs.process("owner-a", attempt.id);

    assert.equal(generate.mock.calls.length, 0);
    assert.deepEqual(await jobs.findOwned("owner-a", attempt.id), {
      kind: "failed",
      code: "provider_submission_unknown",
      message: "Video creation could not be safely resumed. Please create a new video.",
    });
  });

  it("resumes stored provider output immediately after a recoverable finishing failure", async () => {
    let now = new Date("2026-08-23T12:00:00Z");
    const records = new InMemoryCreationRecordStore(() => now);
    const objects = new InMemoryObjectStore();
    const tasks = new InMemoryTaskQueue();
    const resume = mock.fn<VideoGenerator["resume"]>(async () => ({
      bytes: new Uint8Array([4, 5, 6]),
    }));
    const video: VideoGenerator = {
      generate: async (_input, operationObserved) => {
        await operationObserved("recoverable-op");
        return { bytes: new Uint8Array([1, 2, 3]) };
      },
      resume,
    };
    let finishCount = 0;
    const director = new DevotionalMovieDirector(
      {
        evaluate: async () => ({ decision: "allow" }),
        craft: async () => ({
          personalizedMessage: "May joy and peace fill your home.",
          videoPromptEN: "A soft diya glow moves gently.",
        }),
      },
      video,
      {
        finish: async ({ video: providerVideo }) => {
          finishCount += 1;
          if (finishCount === 1) throw new Error("worker crashed during finishing");
          return {
            bytes: providerVideo.bytes,
            mediaType: "video/mp4",
            byteCount: providerVideo.bytes.byteLength,
            sha256: "resumed-movie-hash",
            durationSeconds: 6,
            width: 720,
            height: 1280,
          };
        },
      },
    );
    const jobs = new DevotionalMovieJobs(records, objects, tasks, testModelModule(director));
    const attempt = testAttempt();
    await jobs.submit({ ownerId: "owner-a" }, attempt);

    await assert.rejects(jobs.process("owner-a", attempt.id), /worker crashed/);
    await jobs.process("owner-a", attempt.id);

    assert.equal(resume.mock.calls.length, 0);
    assert.ok([...objects.objects.keys()].some((key) => key.startsWith("provider-raw/")));
    assert.equal((await jobs.findOwned("owner-a", attempt.id))?.kind, "ready");
  });

  it("rejects disallowed personalization before reserving a video credit", async () => {
    const records = new InMemoryCreationRecordStore();
    const objects = new InMemoryObjectStore();
    const tasks = new InMemoryTaskQueue();
    const reserve = mock.fn(async () => {});
    const generate = mock.fn<VideoGenerator["generate"]>();
    const director = new DevotionalMovieDirector(
      {
        evaluate: async () => ({
          decision: "block",
          coarseReason: "politics",
          userMessage: "Please keep your request devotional and non-political.",
        }),
        craft: mock.fn(),
      },
      { generate, resume: mock.fn() },
      { finish: mock.fn() },
    );
    const jobs = new DevotionalMovieJobs(
      records,
      objects,
      tasks,
      testModelModule(director),
      { reserve },
    );
    const attempt = testAttempt({ dedication: "A political campaign message" });
    await jobs.submit({ ownerId: "owner-a" }, attempt);

    await jobs.process("owner-a", attempt.id);

    assert.equal(reserve.mock.calls.length, 0);
    assert.equal(generate.mock.calls.length, 0);
    assert.deepEqual(await jobs.findOwned("owner-a", attempt.id), {
      kind: "rejected",
      code: "devotional_request_not_allowed",
      message: "Please keep your request devotional and non-political.",
    });
  });

  it("fails closed after intent approval but before the video provider when reservation is unavailable", async () => {
    const records = new InMemoryCreationRecordStore();
    const objects = new InMemoryObjectStore();
    const tasks = new InMemoryTaskQueue();
    const create = mock.fn<DevotionalModelModule["create"]>(
      async (_profile, _attempt, lifecycle) => {
        await lifecycle.beforeSubmission("Approved devotional message.");
        throw new Error("unreachable");
      },
    );
    const models: DevotionalModelModule = {
      activeProfileVersion: "test-model-profile-v1",
      create,
      resume: mock.fn(),
      finish: mock.fn(),
    };
    const jobs = new DevotionalMovieJobs(
      records,
      objects,
      tasks,
      models,
      { reserve: async () => { throw new DailySpendLimitError(); } },
    );
    const attempt = testAttempt();
    await jobs.submit({ ownerId: "owner-a" }, attempt);

    await jobs.process("owner-a", attempt.id);

    assert.equal(create.mock.calls.length, 1);
    assert.deepEqual(await jobs.findOwned("owner-a", attempt.id), {
      kind: "failed",
      code: "daily_spend_limit_reached",
      message: "Today's video creation limit has been reached. Please try again tomorrow.",
    });
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function makeHarness() {
  const records = new InMemoryCreationRecordStore();
  const objects = new InMemoryObjectStore();
  const tasks = new InMemoryTaskQueue();
  const generate = mock.fn<VideoGenerator["generate"]>(
    async (_input, operationObserved) => {
      await operationObserved("op-1");
      return { bytes: new Uint8Array([1, 2, 3]) };
    },
  );
  const video: VideoGenerator = {
    generate,
    resume: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
    }),
  };
  const jobs = new DevotionalMovieJobs(
    records,
    objects,
    tasks,
    testModelModule(makeDirector(video)),
  );
  return { records, objects, tasks, generate, jobs };
}

function makeDirector(video: VideoGenerator) {
  return new DevotionalMovieDirector(
    {
      evaluate: async () => ({ decision: "allow" }),
      craft: async () => ({
        personalizedMessage: "May joy and peace fill your home.",
        videoPromptEN: "A soft diya glow moves gently.",
      }),
    },
    video,
    {
      finish: async ({ video: providerVideo }) => ({
        bytes: providerVideo.bytes,
        mediaType: "video/mp4",
        byteCount: providerVideo.bytes.byteLength,
        sha256: "movie-hash",
        durationSeconds: 6,
        width: 720,
        height: 1280,
      }),
    },
  );
}
