import { randomUUID } from "node:crypto";
import type {
  AttemptRecord, FailureCode, LeaseResult, ProcessingFailureResult, StoredMovie, StoredProviderVideo,
} from "./contracts.js";
import { ProcessingLeaseLostError } from "./errors.js";

export const PROCESSING_LEASE_SECONDS = 15 * 60;
export const MAX_PROCESSING_ATTEMPTS = 3;
// Two maximum Cloud Tasks backoff windows after the last processing lease.
export const STALE_PROCESSING_GRACE_MS = 10 * 60 * 1000;

/**
 * The job state machine, shared by transactional Firestore and in-memory storage.
 * Each worker owns a unique lease: late callbacks cannot mutate its replacement.
 * Acquisitions count toward the retry budget even when a process dies before catch.
 * A provider submission without an observed operation is never submitted again.
 */
export class AttemptLifecycle {
  constructor(readonly record: AttemptRecord, private readonly now: Date) {}

  attachInput(objectKey: string): void {
    if (this.record.inputObjectKey !== undefined && this.record.inputObjectKey !== objectKey) {
      throw new Error("Input object key is immutable.");
    }
    this.record.inputObjectKey = objectKey;
  }

  markQueued(queueTaskName: string): void {
    this.record.queueTaskName ??= queueTaskName;
    if (this.record.state === "accepting") this.record.state = "queued";
  }

  beginProcessing(leaseSeconds: number): LeaseResult {
    const record = this.record;
    const activeLease = record.leaseExpiresAt !== undefined && record.leaseExpiresAt > this.now;
    if (record.inputObjectKey === undefined || isTerminalAttempt(record) || activeLease) {
      return { kind: "notAcquired", record };
    }
    if ((record.processingAttemptCount ?? 0) >= MAX_PROCESSING_ATTEMPTS) {
      this.failUnrecoverable();
      return { kind: "notAcquired", record };
    }
    record.processingAttemptCount = (record.processingAttemptCount ?? 0) + 1;
    record.processingLeaseId = randomUUID();
    record.leaseExpiresAt = new Date(this.now.getTime() + leaseSeconds * 1000);
    if (record.state !== "providerSubmitting") record.state = "processing";
    return { kind: "acquired", record };
  }

  recordProcessingFailure(maxFailures: number, leaseId?: string): ProcessingFailureResult {
    const record = this.record;
    if (isTerminalAttempt(record) || !this.ownsLease(leaseId)) return { terminal: true, record };
    record.processingFailureCount = (record.processingFailureCount ?? 0) + 1;
    record.lastProcessingFailureAt = this.now;
    delete record.leaseExpiresAt;
    const terminal = record.processingFailureCount >= maxFailures ||
      (record.processingAttemptCount ?? 0) >= MAX_PROCESSING_ATTEMPTS;
    if (terminal) this.failUnrecoverable();
    return { terminal, record };
  }

  failIfStale(staleBefore: Date): AttemptRecord {
    const record = this.record;
    const activityAt = record.leaseExpiresAt ?? record.lastProcessingFailureAt ?? record.createdAt;
    if ((record.state === "processing" || record.state === "providerSubmitting") &&
        activityAt <= staleBefore) {
      this.failUnrecoverable();
    }
    return record;
  }

  markProviderSubmitting(personalizedMessage: string, leaseId?: string): void {
    this.requireLease(leaseId);
    if (this.record.state !== "processing") throw new Error("Paid submission requires processing lease.");
    this.record.state = "providerSubmitting";
    this.record.providerSubmissionStartedAt = this.now;
    this.record.personalizedMessage = personalizedMessage;
  }

  attachProviderOperation(operationId: string, leaseId?: string): void {
    this.requireLease(leaseId);
    if (this.record.providerOperationId !== undefined && this.record.providerOperationId !== operationId) {
      throw new Error("Provider operation ID is immutable.");
    }
    this.record.providerOperationId = operationId;
  }

  attachProviderOutput(output: StoredProviderVideo, leaseId?: string): void {
    this.requireLease(leaseId);
    if (this.record.rawProviderObjectKey !== undefined &&
        this.record.rawProviderObjectKey !== output.objectKey) {
      throw new Error("Raw provider output is immutable.");
    }
    this.record.rawProviderObjectKey = output.objectKey;
    this.record.rawProviderByteCount = output.byteCount;
    this.record.rawProviderSHA256 = output.sha256;
  }

  complete(movie: StoredMovie, message: string, leaseId?: string): void {
    this.requireLease(leaseId);
    if (isTerminalAttempt(this.record)) throw new Error("Terminal attempt cannot become ready.");
    Object.assign(this.record, {
      state: "ready", personalizedMessage: message, outputObjectKey: movie.objectKey,
      mediaType: movie.mediaType, byteCount: movie.byteCount, sha256: movie.sha256,
      durationSeconds: movie.durationSeconds, completedAt: this.now,
    });
    delete this.record.leaseExpiresAt;
  }

  reject(userMessage: string, leaseId?: string): void {
    if (isTerminalAttempt(this.record)) return;
    this.requireLease(leaseId);
    this.record.state = "blocked";
    this.record.userMessage = userMessage;
    this.record.completedAt = this.now;
    delete this.record.leaseExpiresAt;
  }

  fail(code: FailureCode, userMessage: string, leaseId?: string): void {
    if (isTerminalAttempt(this.record)) return;
    this.requireLease(leaseId);
    this.record.state = code === "provider_submission_unknown" ? "submissionUnknown" : "failed";
    this.record.failureCode = code;
    this.record.userMessage = userMessage;
    this.record.completedAt = this.now;
    delete this.record.leaseExpiresAt;
  }

  private failUnrecoverable(): void {
    const unknownSubmission = this.record.state === "providerSubmitting" &&
      this.record.providerOperationId === undefined;
    this.fail(
      unknownSubmission ? "provider_submission_unknown" : "generation_temporarily_unavailable",
      unknownSubmission
        ? "Video creation could not be safely resumed. Please create a new video."
        : "Video creation is temporarily unavailable. Please try again.",
    );
  }

  private ownsLease(leaseId: string | undefined): boolean {
    return leaseId === undefined || (this.record.processingLeaseId === leaseId &&
      this.record.leaseExpiresAt !== undefined && this.record.leaseExpiresAt > this.now);
  }

  private requireLease(leaseId: string | undefined): void {
    if (!this.ownsLease(leaseId)) throw new ProcessingLeaseLostError();
  }
}

export function isTerminalAttempt(record: AttemptRecord): boolean {
  return ["ready", "blocked", "failed", "submissionUnknown"].includes(record.state);
}
