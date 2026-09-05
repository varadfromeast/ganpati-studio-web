import { z } from "zod";
import type { FalImageToVideoProfile } from "../model/falVideoProfiles.js";

const TimestampSchema = z.string().datetime({ offset: true });
const PricingUnitSchema = z.enum(["videos", "seconds", "compute seconds", "units"]);

export const PricingQuoteSchema = z.object({
  unitPriceUSD: z.number().nonnegative().finite(),
  unit: PricingUnitSchema,
  retrievedAt: TimestampSchema,
}).strict();

export type PricingQuote = z.infer<typeof PricingQuoteSchema>;

const BenchmarkResultSchema = z.object({
  profileVersion: z.string().min(1),
  endpointId: z.string().min(1),
  status: z.enum(["submitted", "completed", "failed"]),
  pricing: PricingQuoteSchema,
  estimatedCostUSD: z.number().nonnegative().finite().nullable(),
  estimatedCostUnavailableReason: z.string().min(1).nullable(),
  submittedAt: TimestampSchema.optional(),
  requestId: z.string().min(1).optional(),
  firstInProgressAt: TimestampSchema.optional(),
  providerCompletedAt: TimestampSchema.optional(),
  finishedAt: TimestampSchema.optional(),
  outputStoredAt: TimestampSchema.optional(),
  submissionLatencyMilliseconds: z.number().nonnegative().finite().optional(),
  queueLatencyMilliseconds: z.number().nonnegative().finite().optional(),
  providerLatencyMilliseconds: z.number().nonnegative().finite().optional(),
  finishingLatencyMilliseconds: z.number().nonnegative().finite().optional(),
  storageLatencyMilliseconds: z.number().nonnegative().finite().optional(),
  totalLatencyMilliseconds: z.number().nonnegative().finite().optional(),
  inferenceTimeSeconds: z.number().nonnegative().finite().optional(),
  outputObjectKey: z.string().min(1).optional(),
  outputByteCount: z.number().int().positive().optional(),
  outputSHA256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  rawVideoObjectKey: z.string().min(1).optional(),
  rawVideoByteCount: z.number().int().positive().optional(),
  rawVideoSHA256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  audioPresent: z.boolean().optional(),
  error: z.string().min(1).optional(),
}).strict();

export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;

const BenchmarkRunSchema = z.object({
  kind: z.literal("fal-image-to-video-benchmark"),
  runId: z.string().regex(/^[A-Za-z0-9_-]+$/u),
  startedAt: TimestampSchema,
  source: z.object({
    localFilename: z.string().min(1),
    objectKey: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }).strict(),
  prompt: z.string().min(1),
  personalizedMessage: z.string().min(1),
  durationSeconds: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  profileCount: z.number().int().positive(),
  profiles: z.array(z.object({
    profileVersion: z.string().min(1),
    endpointId: z.string().min(1),
  }).strict()).min(1),
  audioComparison: z.string().min(1),
  suite: z.string().min(1).optional(),
  spokenMessage: z.string().min(1).optional(),
}).strict();

export type BenchmarkRun = z.infer<typeof BenchmarkRunSchema>;

type ExpectedRunIdentity = {
  runId: string;
  sourceObjectKey: string;
  sourceSHA256: string;
  prompt: string;
  personalizedMessage: string;
  durationSeconds: number;
  width: number;
  height: number;
  profiles: readonly FalImageToVideoProfile[];
  suite?: string;
  spokenMessage?: string;
};

export function parseAndMatchRun(raw: unknown, expected: ExpectedRunIdentity): BenchmarkRun {
  const run = BenchmarkRunSchema.parse(raw);
  const expectedProfiles = expected.profiles.map((profile) => ({
    profileVersion: profile.version,
    endpointId: profile.endpointId,
  }));
  const matches = run.runId === expected.runId
    && run.source.objectKey === expected.sourceObjectKey
    && run.source.sha256 === expected.sourceSHA256
    && run.prompt === expected.prompt
    && run.personalizedMessage === expected.personalizedMessage
    && run.durationSeconds === expected.durationSeconds
    && run.width === expected.width
    && run.height === expected.height
    && run.profileCount === expectedProfiles.length
    && JSON.stringify(run.profiles) === JSON.stringify(expectedProfiles)
    && (expected.suite === undefined || run.suite === expected.suite)
    && (expected.spokenMessage === undefined || run.spokenMessage === expected.spokenMessage);
  if (!matches) throw new Error("Persisted benchmark run identity does not match the requested resume.");
  return run;
}

export function parseAndMatchCheckpoint(
  raw: unknown,
  profile: FalImageToVideoProfile,
): BenchmarkResult & { requestId: string; submittedAt: string } {
  const checkpoint = BenchmarkResultSchema.parse(raw);
  if (checkpoint.profileVersion !== profile.version || checkpoint.endpointId !== profile.endpointId) {
    throw new Error(`Persisted checkpoint identity does not match ${profile.version}.`);
  }
  if (checkpoint.requestId === undefined || checkpoint.submittedAt === undefined) {
    throw new Error(`Cannot resume ${profile.endpointId} without its persisted request ID.`);
  }
  return { ...checkpoint, requestId: checkpoint.requestId, submittedAt: checkpoint.submittedAt };
}

export function estimateCost(
  pricing: PricingQuote,
  durationSeconds: number,
  inferenceTimeSeconds?: number,
): Pick<BenchmarkResult, "estimatedCostUSD" | "estimatedCostUnavailableReason"> {
  switch (pricing.unit) {
    case "videos":
      return { estimatedCostUSD: pricing.unitPriceUSD, estimatedCostUnavailableReason: null };
    case "seconds":
      return {
        estimatedCostUSD: roundedUSD(pricing.unitPriceUSD * durationSeconds),
        estimatedCostUnavailableReason: null,
      };
    case "compute seconds":
      return inferenceTimeSeconds === undefined
        ? {
            estimatedCostUSD: null,
            estimatedCostUnavailableReason: "Provider did not report inference time.",
          }
        : {
            estimatedCostUSD: roundedUSD(pricing.unitPriceUSD * inferenceTimeSeconds),
            estimatedCostUnavailableReason: null,
          };
    case "units":
      return {
        estimatedCostUSD: null,
        estimatedCostUnavailableReason: "The endpoint's billed-unit conversion is not defined.",
      };
  }
}

function roundedUSD(value: number): number {
  return Number(value.toFixed(8));
}

export function elapsedMilliseconds(startedAt: string | Date, endedAt: Date): number {
  const start = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  return endedAt.getTime() - start.getTime();
}

export function benchmarkJSONSaveOptions(createOnly: boolean) {
  return {
    resumable: false,
    contentType: "application/json",
    validation: "crc32c" as const,
    ...(createOnly ? { preconditionOpts: { ifGenerationMatch: 0 } } : {}),
  };
}
