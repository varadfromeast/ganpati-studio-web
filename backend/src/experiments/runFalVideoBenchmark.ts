import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createFalClient, type QueueStatus } from "@fal-ai/client";
import { Storage } from "@google-cloud/storage";
import { z } from "zod";
import { FFmpegMediaFinisher } from "../devotional-movie/mediaFinishing.js";
import type { FalImageToVideoProfile } from "../model/falVideoProfiles.js";
import {
  FAL_DEVOTIONAL_VIDEO_PROFILES,
  FAL_SPEAKING_VIDEO_PROFILES,
} from "../model/falVideoProfiles.js";
import {
  benchmarkJSONSaveOptions,
  elapsedMilliseconds,
  estimateCost,
  parseAndMatchCheckpoint,
  parseAndMatchRun,
  type BenchmarkResult,
  type BenchmarkRun,
  type PricingQuote,
} from "./falVideoBenchmarkState.js";

const FalResultSchema = z.object({
  video: z.object({
    url: z.string().url(),
    content_type: z.string().optional(),
  }).passthrough(),
}).passthrough();

const PRICING_RETRIEVED_AT = "2026-08-26T00:00:00Z";
const PRICING = new Map<string, PricingQuote>([
  ["fal-ai/ltx-video/image-to-video", { unitPriceUSD: 0.02, unit: "videos", retrievedAt: PRICING_RETRIEVED_AT }],
  ["lightricks/ltx-2.5/image-to-video/fast", { unitPriceUSD: 0.00017, unit: "compute seconds", retrievedAt: PRICING_RETRIEVED_AT }],
  ["fal-ai/wan/v2.2-a14b/image-to-video/turbo", { unitPriceUSD: 0.1, unit: "videos", retrievedAt: PRICING_RETRIEVED_AT }],
  ["xai/grok-imagine-video/image-to-video", { unitPriceUSD: 0.05, unit: "seconds", retrievedAt: PRICING_RETRIEVED_AT }],
  ["bytedance/seedance-2.0/fast/image-to-video", { unitPriceUSD: 0.0112, unit: "units", retrievedAt: PRICING_RETRIEVED_AT }],
  ["google/gemini-omni-flash/image-to-video", { unitPriceUSD: 1, unit: "units", retrievedAt: PRICING_RETRIEVED_AT }],
  ["xai/grok-imagine-video/v1.5/image-to-video", { unitPriceUSD: 0.01, unit: "seconds", retrievedAt: PRICING_RETRIEVED_AT }],
  ["fal-ai/pixverse/c1/image-to-video", { unitPriceUSD: 0.005, unit: "seconds", retrievedAt: PRICING_RETRIEVED_AT }],
  ["lightricks/ltx-2.5/image-to-video/pro", { unitPriceUSD: 0.00017, unit: "compute seconds", retrievedAt: PRICING_RETRIEVED_AT }],
  ["alibaba/wan-3.0-prime/image-to-video", { unitPriceUSD: 0.05, unit: "seconds", retrievedAt: PRICING_RETRIEVED_AT }],
  ["fal-ai/kling-video/v3/standard/image-to-video", { unitPriceUSD: 0.14, unit: "seconds", retrievedAt: PRICING_RETRIEVED_AT }],
  ["fal-ai/veo3.1/fast/image-to-video", { unitPriceUSD: 0.15, unit: "seconds", retrievedAt: PRICING_RETRIEVED_AT }],
]);

const originalPrompt = [
  "Create one polished, emotionally uplifting six-second cinematic devotional moment from this approved Ganpati artwork.",
  "Keep Bal Ganpati's identity, face, trunk, curly hair, tilak, hands, modak, clothing, jewelry, body proportions, cushion, toys, and room composition unchanged.",
  "Open almost still, then add a slow elegant camera push-in with subtle dimensional parallax as warm window light blooms across the room.",
  "Bal Ganpati makes one natural gentle blink, a tiny joyful trunk sway, and an extremely slight blessing-hand motion while keeping the serene expression and exact anatomy.",
  "A few marigold petals and delicate golden particles lift softly; the nearby wooden toys rock almost imperceptibly; finish centered, calm, bright, and share-worthy.",
  "When native audio is supported, add a soft auspicious temple-bell shimmer, warm festive ambience, and a gentle musical swell with no voice or chanting.",
  "No speech, lip movement, new objects, extra limbs, morphing, cuts, scene changes, camera shake, embedded text, captions, or watermark.",
].join(" ");
const speakingPrompt = [
  "Create one polished, adorable six-second cinematic devotional moment from this approved Bal Ganpati artwork.",
  "Preserve Bal Ganpati's exact identity, face, elephant trunk, curly hair, tilak, eyes, hands, modak, clothing, jewelry, body proportions, cushion, toys, and room composition.",
  "Use one continuous vertical shot with a very slow elegant camera push-in, warm window-light bloom, subtle dimensional parallax, a gentle blink, a tiny joyful trunk sway, delicate golden particles, and a few softly lifting marigold petals.",
  "Bal Ganpati looks warmly toward the viewer and says exactly once in clear English: ‘Happy Ganesh Chaturthi.’",
  "The voice is cute, sweet, youthful, warm, innocent, and devotional, with precise pronunciation; synchronize the short phrase to subtle believable cheek and mouth motion while keeping the elephant face and trunk anatomically stable.",
  "Add a soft auspicious temple-bell shimmer and gentle festive musical ambience under the voice, keeping every word clearly audible.",
  "No other words, chanting, singing, subtitles, embedded text, watermark, new objects, extra limbs, altered hands, morphing, cuts, scene changes, camera shake, or exaggerated lip movement.",
].join(" ");
const message = "Happy Ganesh Chaturthi";
const durationSeconds = 6 as const;

if (process.env["ENABLE_FAL_VIDEO_BENCHMARK"] !== "true") {
  throw new Error("Set ENABLE_FAL_VIDEO_BENCHMARK=true to enable the guarded benchmark runner.");
}

const apiKey = requiredEnvironment("FAL_API_KEY");
const bucketName = requiredEnvironment("MOVIE_BUCKET");
const runId = process.env["BENCHMARK_RUN_ID"] ?? new Date().toISOString().replaceAll(/[:.]/gu, "-");
const resumeExisting = process.env["BENCHMARK_RESUME"] === "true";
const suite = process.env["BENCHMARK_SUITE"] ?? "original";
if (suite !== "original" && suite !== "speaking-v1") throw new Error("BENCHMARK_SUITE is invalid.");
const profiles: readonly FalImageToVideoProfile[] = suite === "speaking-v1"
  ? FAL_SPEAKING_VIDEO_PROFILES
  : FAL_DEVOTIONAL_VIDEO_PROFILES;
const prompt = suite === "speaking-v1" ? speakingPrompt : originalPrompt;
if (!/^[A-Za-z0-9_-]+$/u.test(runId)) throw new Error("BENCHMARK_RUN_ID is invalid.");

const prefix = `experiments/fal-video-benchmark/${runId}`;
const bucket = new Storage().bucket(bucketName);
const sourcePath = process.env["BENCHMARK_SOURCE_IMAGE"];
const sourceArtwork = resumeExisting
  ? new Uint8Array((await bucket.file(`${prefix}/source.png`).download())[0])
  : new Uint8Array(await readFile(requiredEnvironment("BENCHMARK_SOURCE_IMAGE")));
const sourceSHA256 = sha256(sourceArtwork);
const fal = createFalClient({ credentials: apiKey });
const finisher = new FFmpegMediaFinisher();
let finishingTail: Promise<void> = Promise.resolve();
const processStartedAt = new Date();
const sourceObjectKey = `${prefix}/source.png`;
const profileIdentities = profiles.map((profile) => ({
  profileVersion: profile.version,
  endpointId: profile.endpointId,
}));
assertBenchmarkPreflight();

let initialManifest: BenchmarkRun;
if (resumeExisting) {
  const [runBytes] = await bucket.file(`${prefix}/run.json`).download();
  initialManifest = parseAndMatchRun(JSON.parse(runBytes.toString("utf8")), {
    runId,
    sourceObjectKey,
    sourceSHA256,
    prompt,
    personalizedMessage: message,
    durationSeconds,
    width: 720,
    height: 1280,
    profiles,
    ...(suite === "speaking-v1" ? { suite, spokenMessage: message } : {}),
  });
} else {
  initialManifest = {
    kind: "fal-image-to-video-benchmark",
    runId,
    startedAt: processStartedAt.toISOString(),
    source: {
      localFilename: basename(sourcePath ?? "source.png"),
      objectKey: sourceObjectKey,
      sha256: sourceSHA256,
    },
    prompt,
    personalizedMessage: message,
    durationSeconds,
    width: 720,
    height: 1280,
    profileCount: profiles.length,
    profiles: profileIdentities,
    audioComparison: "Native provider audio enabled where the endpoint schema supports it; otherwise silent.",
    ...(suite === "speaking-v1" ? { suite, spokenMessage: message } : {}),
  };
  // This atomic create is the paid-call boundary. A reused run ID fails before any fal upload or submit.
  await saveJSON(`${prefix}/run.json`, initialManifest, true);
}

let imageURL: string | undefined;
let preparedInputs = new Map<string, Record<string, unknown>>();
if (!resumeExisting) {
  await bucket.file(sourceObjectKey).save(Buffer.from(sourceArtwork), {
    resumable: false,
    contentType: "image/png",
    metadata: { metadata: { sha256: sourceSHA256 } },
    validation: "crc32c",
  });
  imageURL = await fal.storage.upload(new Blob([sourceArtwork], { type: "image/png" }), {
    lifecycle: { expiresIn: "1h" },
  });
  preparedInputs = new Map(profiles.map((profile) => [
    profile.version,
    profile.buildInput({
      sourceArtwork,
      trustedPrompt: prompt,
      durationSeconds,
      width: 720,
      height: 1280,
    }, imageURL as string),
  ]));
}

const results = await Promise.all(profiles.map(benchmark));
const completedAt = new Date();
const manifest = {
  ...initialManifest,
  completedAt: completedAt.toISOString(),
  wallClockLatencyMilliseconds: elapsedMilliseconds(initialManifest.startedAt, completedAt),
  processLatencyMilliseconds: elapsedMilliseconds(processStartedAt, completedAt),
  results,
};
await saveJSON(`${prefix}/manifest.json`, manifest);
console.log(JSON.stringify({ bucket: bucketName, prefix, manifest }, null, 2));

async function benchmark(profile: FalImageToVideoProfile): Promise<BenchmarkResult> {
  const pricing = PRICING.get(profile.endpointId);
  if (pricing === undefined) throw new Error(`Missing pricing quote for ${profile.endpointId}.`);
  const profileKey = profile.version.replaceAll(/[^A-Za-z0-9_-]/gu, "_");
  let profileStartedAt = new Date();
  let effectivePricing = pricing;
  let current: BenchmarkResult = {
    profileVersion: profile.version,
    endpointId: profile.endpointId,
    status: "submitted",
    pricing,
    ...estimateCost(pricing, durationSeconds),
  };

  try {
    let requestId: string;
    let submittedAt: Date;
    if (resumeExisting) {
      const [checkpointBytes] = await bucket.file(`${prefix}/models/${profileKey}.json`).download();
      const checkpoint = parseAndMatchCheckpoint(
        JSON.parse(checkpointBytes.toString("utf8")),
        profile,
      );
      current = checkpoint;
      effectivePricing = checkpoint.pricing;
      requestId = checkpoint.requestId;
      submittedAt = new Date(checkpoint.submittedAt);
      profileStartedAt = new Date(
        submittedAt.getTime() - (checkpoint.submissionLatencyMilliseconds ?? 0),
      );
    } else {
      const profileInput = preparedInputs.get(profile.version);
      if (profileInput === undefined) throw new Error(`Prepared input is unavailable for ${profile.version}.`);
      const submitted = await fal.queue.submit(profile.endpointId, {
        input: profileInput,
        priority: "normal",
        startTimeout: 120,
        storageSettings: { expiresIn: "1h" },
      });
      submittedAt = new Date();
      requestId = submitted.request_id;
      current = {
        ...current,
        submittedAt: submittedAt.toISOString(),
        requestId,
        submissionLatencyMilliseconds: submittedAt.getTime() - profileStartedAt.getTime(),
      };
      await saveJSON(`${prefix}/models/${profileKey}.json`, current);
    }

    const rawVideoObjectKey = `${prefix}/raw-videos/${profileKey}.mp4`;
    const rawVideoFile = bucket.file(rawVideoObjectKey);
    const [rawVideoExists] = await rawVideoFile.exists();
    let firstInProgressAt = current.firstInProgressAt === undefined ? undefined : new Date(current.firstInProgressAt);
    let completedStatus: Extract<QueueStatus, { status: "COMPLETED" }> | undefined;
    if (!(resumeExisting && rawVideoExists)) {
      const deadline = Date.now() + 15 * 60_000;
      while (completedStatus === undefined) {
        const status = await fal.queue.status(profile.endpointId, { requestId, logs: false });
        if (status.status === "IN_PROGRESS" && firstInProgressAt === undefined) {
          firstInProgressAt = new Date();
          current = {
            ...current,
            status: "submitted",
            firstInProgressAt: firstInProgressAt.toISOString(),
            queueLatencyMilliseconds: firstInProgressAt.getTime() - submittedAt.getTime(),
          };
          delete current.error;
          await saveJSON(`${prefix}/models/${profileKey}.json`, current);
        }
        if (status.status === "COMPLETED") completedStatus = status;
        if (completedStatus === undefined) {
          if (Date.now() >= deadline) throw new Error("fal operation exceeded the 15-minute benchmark deadline.");
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
    }

    const providerCompletedAt = current.providerCompletedAt === undefined
      ? new Date()
      : new Date(current.providerCompletedAt);
    if (current.providerCompletedAt === undefined) {
      const inferenceTimeSeconds = completedStatus?.metrics?.inference_time ?? undefined;
      current = {
        ...current,
        providerCompletedAt: providerCompletedAt.toISOString(),
        providerLatencyMilliseconds: providerCompletedAt.getTime() - submittedAt.getTime(),
        ...(inferenceTimeSeconds === undefined ? {} : { inferenceTimeSeconds }),
      };
      delete current.error;
      await saveJSON(`${prefix}/models/${profileKey}.json`, current);
    }
    let providerBytes: Uint8Array;
    let providerContentType = "video/mp4";
    if (resumeExisting && rawVideoExists) {
      providerBytes = new Uint8Array((await rawVideoFile.download())[0]);
    } else {
      const raw = (await fal.queue.result(profile.endpointId, { requestId })).data;
      const parsed = FalResultSchema.parse(raw);
      const response = await fetch(parsed.video.url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`fal video download failed with status ${response.status}.`);
      providerBytes = new Uint8Array(await response.arrayBuffer());
      providerContentType = parsed.video.content_type ?? providerContentType;
    }
    if (providerBytes.byteLength === 0 || providerBytes.byteLength > 40 * 1024 * 1024) {
      throw new Error("fal video is empty or exceeds the 40 MB benchmark limit.");
    }
    if (!rawVideoExists) {
      await rawVideoFile.save(Buffer.from(providerBytes), {
        resumable: false,
        contentType: providerContentType,
        metadata: { metadata: { endpointId: profile.endpointId, requestId } },
        validation: "crc32c",
      });
      const inferenceTimeSeconds = completedStatus?.metrics?.inference_time ?? undefined;
      current = {
        ...current,
        providerCompletedAt: providerCompletedAt.toISOString(),
        providerLatencyMilliseconds: providerCompletedAt.getTime() - submittedAt.getTime(),
        ...(inferenceTimeSeconds === undefined ? {} : { inferenceTimeSeconds }),
        rawVideoObjectKey,
        rawVideoByteCount: providerBytes.byteLength,
        rawVideoSHA256: sha256(providerBytes),
      };
      delete current.error;
      await saveJSON(`${prefix}/models/${profileKey}.json`, current);
    }

    const finishingStartedAt = new Date();
    const finished = await serializeFinishing(() => finisher.finish({
        video: { bytes: providerBytes },
        personalizedMessage: message,
        localeIdentifier: "en-IN",
      }));
    const finishedAt = new Date();
    const outputObjectKey = `${prefix}/videos/${profileKey}.mp4`;
    await bucket.file(outputObjectKey).save(Buffer.from(finished.bytes), {
      resumable: false,
      contentType: finished.mediaType,
      metadata: { metadata: { sha256: finished.sha256, endpointId: profile.endpointId, requestId } },
      validation: "crc32c",
    });
    const outputStoredAt = new Date();
    const inferenceTimeSeconds = completedStatus?.metrics?.inference_time ?? current.inferenceTimeSeconds;

    current = {
      ...current,
      status: "completed",
      ...(firstInProgressAt === undefined ? {} : {
        firstInProgressAt: firstInProgressAt.toISOString(),
        queueLatencyMilliseconds: firstInProgressAt.getTime() - submittedAt.getTime(),
      }),
      providerCompletedAt: providerCompletedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      outputStoredAt: outputStoredAt.toISOString(),
      providerLatencyMilliseconds: providerCompletedAt.getTime() - submittedAt.getTime(),
      finishingLatencyMilliseconds: finishedAt.getTime() - finishingStartedAt.getTime(),
      storageLatencyMilliseconds: outputStoredAt.getTime() - finishedAt.getTime(),
      totalLatencyMilliseconds: outputStoredAt.getTime() - profileStartedAt.getTime(),
      ...(inferenceTimeSeconds === undefined
        ? {}
        : { inferenceTimeSeconds }),
      ...estimateCost(effectivePricing, durationSeconds, inferenceTimeSeconds),
      outputObjectKey,
      outputByteCount: finished.byteCount,
      outputSHA256: finished.sha256,
      audioPresent: finished.audioPresent,
    };
    delete current.error;
  } catch (error) {
    current = {
      ...current,
      status: "failed",
      totalLatencyMilliseconds: Date.now() - profileStartedAt.getTime(),
      error: safeError(error),
    };
  }
  await saveJSON(`${prefix}/models/${profileKey}.json`, current);
  return current;
}

async function saveJSON(objectKey: string, value: unknown, createOnly = false): Promise<void> {
  await bucket.file(objectKey).save(
    JSON.stringify(value, null, 2),
    benchmarkJSONSaveOptions(createOnly),
  );
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required.`);
  return value;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeError(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : "Unknown benchmark failure.";
  return errorMessage.replaceAll(apiKey, "[redacted]").slice(0, 1_000);
}

function assertBenchmarkPreflight(): void {
  const versions = new Set<string>();
  const endpointIds = new Set<string>();
  const objectKeys = new Set<string>();
  for (const profile of profiles) {
    const profileKey = profile.version.replaceAll(/[^A-Za-z0-9_-]/gu, "_");
    if (versions.has(profile.version)) throw new Error(`Duplicate benchmark profile version ${profile.version}.`);
    if (endpointIds.has(profile.endpointId)) throw new Error(`Duplicate benchmark endpoint ${profile.endpointId}.`);
    if (objectKeys.has(profileKey)) throw new Error(`Benchmark profile key collision for ${profile.version}.`);
    if (!PRICING.has(profile.endpointId)) throw new Error(`Missing pricing quote for ${profile.endpointId}.`);
    versions.add(profile.version);
    endpointIds.add(profile.endpointId);
    objectKeys.add(profileKey);
  }
}

async function serializeFinishing<T>(operation: () => Promise<T>): Promise<T> {
  const result = finishingTail.then(operation);
  finishingTail = result.then(() => undefined, () => undefined);
  return result;
}
