export const PRODUCT_VIDEO_PROFILE = "portrait-720x1280-six-seconds-v1";
export const POLICY_VERSION = "ganpati-devotional-policy-v1";
export const MODEL_PROFILE_VERSION = "gemini-devotional-v1";

export type AuthenticatedPrincipal = { ownerId: string };

export type CreationAttempt = {
  id: string;
  requestDigest: string;
  artwork: Uint8Array;
  artworkSHA256: string;
  dedication: string;
  recipientName?: string;
  occasion?: string;
  localeIdentifier: string;
};

export type SourceArtwork = {
  ownerId: string;
  attemptId: string;
  bytes: Uint8Array;
  sha256: string;
};

export type StoredInput = { objectKey: string };

export type FinishedMovie = {
  ownerId: string;
  attemptId: string;
  bytes: Uint8Array;
  mediaType: "video/mp4";
  byteCount: number;
  sha256: string;
  durationSeconds: number;
  width: number;
  height: number;
};

export type StoredMovie = Omit<FinishedMovie, "bytes" | "ownerId" | "attemptId"> & {
  objectKey: string;
};

export type DownloadGrant = { url: string; expiresAt: Date };

export type DownloadDescriptor = {
  url: string;
  expiresAt: string;
  mediaType: "video/mp4";
  byteCount: number;
  sha256: string;
  durationSeconds: number;
};

export type JobSnapshot =
  | { kind: "processing"; attemptId: string; retryAfterSeconds: number }
  | {
      kind: "ready";
      id: string;
      personalizedMessage: string;
      download: DownloadDescriptor;
    }
  | {
      kind: "rejected";
      code: "devotional_request_not_allowed";
      message: string;
    }
  | { kind: "failed"; code: FailureCode; message: string };

export type FailureCode =
  | "generation_temporarily_unavailable"
  | "media_processing_failed"
  | "provider_submission_unknown"
  | "daily_spend_limit_reached"
  | "generation_credits_required";

export type PolicyStage = "userRequest" | "generatedBrief";
export type PolicyInput = {
  stage: PolicyStage;
  dedication: string;
  recipientName?: string;
  occasion?: string;
  localeIdentifier: string;
  personalizedMessage?: string;
  videoPromptEN?: string;
};

export type PolicyDecision =
  | { decision: "allow" }
  | { decision: "block" | "review"; coarseReason: string; userMessage: string };

export type NarrativeInput = {
  artwork: Uint8Array;
  dedication: string;
  recipientName?: string;
  occasion?: string;
  localeIdentifier: string;
};

export type DevotionalNarrative = {
  personalizedMessage: string;
  videoPromptEN: string;
};

export interface DevotionalLanguageModel {
  evaluate(input: PolicyInput): Promise<PolicyDecision>;
  craft(input: NarrativeInput): Promise<DevotionalNarrative>;
}

export type VideoInput = {
  sourceArtwork: Uint8Array;
  trustedPrompt: string;
  durationSeconds: 6;
  width: 720;
  height: 1280;
};

export type ProviderVideo = {
  bytes: Uint8Array;
};

export type StoredProviderVideo = {
  objectKey: string;
  byteCount: number;
  sha256: string;
};

export type ProviderOperationObserver = (operationId: string) => Promise<void>;

export interface VideoGenerator {
  /** Persists a provider operation before waiting for its potentially long-running result. */
  generate(input: VideoInput, operationObserved: ProviderOperationObserver): Promise<ProviderVideo>;
  resume(operationId: string): Promise<ProviderVideo>;
}

export interface MediaFinisher {
  finish(input: {
    video: ProviderVideo;
    personalizedMessage: string;
    localeIdentifier: string;
  }): Promise<Omit<FinishedMovie, "ownerId" | "attemptId">>;
}

export type AttemptState =
  | "accepting"
  | "queued"
  | "processing"
  | "providerSubmitting"
  | "ready"
  | "blocked"
  | "failed"
  | "submissionUnknown";

export type AttemptRecord = {
  ownerId: string;
  attemptId: string;
  requestDigest: string;
  artworkSHA256: string;
  dedication: string;
  recipientName?: string;
  occasion?: string;
  localeIdentifier: string;
  state: AttemptState;
  inputObjectKey?: string;
  queueTaskName?: string;
  leaseExpiresAt?: Date;
  processingLeaseId?: string;
  processingAttemptCount?: number;
  processingFailureCount?: number;
  lastProcessingFailureAt?: Date;
  providerSubmissionStartedAt?: Date;
  providerOperationId?: string;
  rawProviderObjectKey?: string;
  rawProviderByteCount?: number;
  rawProviderSHA256?: string;
  policyVersion: string;
  modelProfileVersion: string;
  personalizedMessage?: string;
  outputObjectKey?: string;
  mediaType?: "video/mp4";
  byteCount?: number;
  sha256?: string;
  durationSeconds?: number;
  failureCode?: FailureCode;
  userMessage?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
};

export type ClaimResult =
  | { kind: "created"; record: AttemptRecord }
  | { kind: "existing"; record: AttemptRecord }
  | { kind: "conflict" };

export type LeaseResult =
  | { kind: "acquired"; record: AttemptRecord }
  | { kind: "notAcquired"; record: AttemptRecord | null };

export type ProcessingFailureResult = {
  terminal: boolean;
  record: AttemptRecord;
};

export interface CreationRecordStore {
  claim(
    ownerId: string,
    attempt: CreationAttempt,
    modelProfileVersion: string,
  ): Promise<ClaimResult>;
  attachInput(ownerId: string, attemptId: string, objectKey: string): Promise<void>;
  markQueued(ownerId: string, attemptId: string, queueTaskName: string): Promise<void>;
  beginProcessing(ownerId: string, attemptId: string, leaseSeconds: number): Promise<LeaseResult>;
  recordProcessingFailure(
    ownerId: string,
    attemptId: string,
    maxFailures: number,
    leaseId?: string,
  ): Promise<ProcessingFailureResult>;
  failIfStale(
    ownerId: string,
    attemptId: string,
    staleBefore: Date,
  ): Promise<AttemptRecord | null>;
  markProviderSubmitting(
    ownerId: string,
    attemptId: string,
    personalizedMessage: string,
    leaseId?: string,
  ): Promise<void>;
  attachProviderOperation(ownerId: string, attemptId: string, operationId: string, leaseId?: string): Promise<void>;
  attachProviderOutput(
    ownerId: string,
    attemptId: string,
    output: StoredProviderVideo,
    leaseId?: string,
  ): Promise<void>;
  complete(ownerId: string, attemptId: string, movie: StoredMovie, message: string, leaseId?: string): Promise<void>;
  reject(ownerId: string, attemptId: string, userMessage: string, leaseId?: string): Promise<void>;
  fail(ownerId: string, attemptId: string, code: FailureCode, userMessage: string, leaseId?: string): Promise<void>;
  findOwned(ownerId: string, attemptId: string): Promise<AttemptRecord | null>;
}

export interface BillableAttemptGuard {
  /** Idempotently reserves one billable attempt or fails before any model API call. */
  reserve(ownerId: string, attemptId: string): Promise<void>;
}

export interface PrivateObjectStore {
  publishInput(input: SourceArtwork): Promise<StoredInput>;
  readInput(objectKey: string): Promise<Uint8Array>;
  publishProviderOutput(input: {
    ownerId: string;
    attemptId: string;
    bytes: Uint8Array;
  }): Promise<StoredProviderVideo>;
  readProviderOutput(objectKey: string): Promise<ProviderVideo>;
  publish(input: FinishedMovie): Promise<StoredMovie>;
  createReadGrant(objectKey: string, ttlSeconds: number): Promise<DownloadGrant>;
}

export type ProcessAttemptTask = { ownerId: string; attemptId: string };
export type EnqueuedTask = { taskName: string };

export interface DurableTaskQueue {
  enqueue(input: ProcessAttemptTask): Promise<EnqueuedTask>;
}

export interface DevotionalMovieJobs {
  submit(owner: AuthenticatedPrincipal, attempt: CreationAttempt): Promise<JobSnapshot>;
  process(ownerId: string, attemptId: string): Promise<void>;
  findOwned(ownerId: string, attemptId: string): Promise<JobSnapshot | null>;
}

export type DirectorOutcome =
  | { kind: "ready"; message: string; movie: Omit<FinishedMovie, "ownerId" | "attemptId"> }
  | { kind: "rejected"; userMessage: string };

export type PaidSubmissionLifecycle = {
  beforeSubmission(personalizedMessage: string): Promise<void>;
  operationObserved(operationId: string): Promise<void>;
  providerOutputObserved(video: ProviderVideo): Promise<void>;
};

export interface DevotionalModelModule {
  readonly activeProfileVersion: string;
  create(
    profileVersion: string,
    attempt: CreationAttempt,
    lifecycle: PaidSubmissionLifecycle,
  ): Promise<DirectorOutcome>;
  resume(
    profileVersion: string,
    operationId: string,
    personalizedMessage: string,
    localeIdentifier: string,
    lifecycle: PaidSubmissionLifecycle,
  ): Promise<DirectorOutcome>;
  finish(
    profileVersion: string,
    video: ProviderVideo,
    personalizedMessage: string,
    localeIdentifier: string,
  ): Promise<DirectorOutcome>;
}
