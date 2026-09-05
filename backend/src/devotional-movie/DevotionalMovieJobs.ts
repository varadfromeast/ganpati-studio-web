import { ProcessingLeaseLostError } from "./errors.js";
import { isTerminalAttempt, MAX_PROCESSING_ATTEMPTS, PROCESSING_LEASE_SECONDS, STALE_PROCESSING_GRACE_MS } from "./AttemptLifecycle.js";
import {
  type AttemptRecord,
  type AuthenticatedPrincipal,
  type CreationAttempt,
  type CreationRecordStore,
  type DevotionalModelModule,
  type DevotionalMovieJobs as DevotionalMovieJobsContract,
  type DurableTaskQueue,
  type JobSnapshot,
  type BillableAttemptGuard,
  type PrivateObjectStore,
} from "./contracts.js";
import { DailySpendLimitError, HttpError } from "./errors.js";
import { NoGenerationCreditsError } from "../economy/GenerationEconomy.js";
import { validateAttempt } from "./validation.js";

const RETRY_AFTER_SECONDS = 2;
const READ_GRANT_TTL_SECONDS = 15 * 60;

export class DevotionalMovieJobs implements DevotionalMovieJobsContract {
  constructor(
    private readonly records: CreationRecordStore,
    private readonly objects: PrivateObjectStore,
    private readonly tasks: DurableTaskQueue,
    private readonly models: DevotionalModelModule,
    private readonly billableAttempts: BillableAttemptGuard = ALLOW_ALL_BILLABLE_ATTEMPTS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async submit(owner: AuthenticatedPrincipal, attempt: CreationAttempt): Promise<JobSnapshot> {
    validateAttempt(attempt);
    const claim = await this.records.claim(
      owner.ownerId,
      attempt,
      this.models.activeProfileVersion,
    );
    if (claim.kind === "conflict") {
      throw new HttpError(409, "idempotency_conflict", "Attempt ID was already used for different content.");
    }
    if (claim.kind === "existing" && isTerminalAttempt(claim.record)) {
      return this.snapshot(claim.record);
    }

    // A completed claim is itself the durable checkpoint. Duplicate POSTs for a
    // queued or running attempt must be reads, not another publish/enqueue pass.
    if (claim.kind === "existing" && claim.record.state !== "accepting") {
      return this.snapshot(claim.record);
    }

    if (claim.record.inputObjectKey === undefined) {
      const input = await this.objects.publishInput({
        ownerId: owner.ownerId,
        attemptId: attempt.id,
        bytes: attempt.artwork,
        sha256: attempt.artworkSHA256,
      });
      await this.records.attachInput(owner.ownerId, attempt.id, input.objectKey);
    }
    const task = await this.tasks.enqueue({ ownerId: owner.ownerId, attemptId: attempt.id });
    await this.records.markQueued(owner.ownerId, attempt.id, task.taskName);

    const current = await this.records.findOwned(owner.ownerId, attempt.id);
    return current === null ? this.processing(attempt.id) : this.snapshot(current);
  }

  async process(ownerId: string, attemptId: string): Promise<void> {
    const lease = await this.records.beginProcessing(ownerId, attemptId, PROCESSING_LEASE_SECONDS);
    if (lease.kind !== "acquired") {
      if (lease.record?.state === "processing" || lease.record?.state === "providerSubmitting") {
        throw new Error("Attempt is still protected by an active processing lease.");
      }
      return;
    }
    const record = lease.record;
    const leaseId = record.processingLeaseId;
    if (record.inputObjectKey === undefined) {
      throw new Error("Processing lease acquired without a published input.");
    }
    // A worker can die after the provider accepted a billable submission but before an
    // operation ID was durably observed. Reacquire the expired lease, but never submit
    // again: there is no safe idempotency proof across that ambiguity window.
    if (record.state === "providerSubmitting" && record.providerOperationId === undefined) {
      await this.records.fail(
        ownerId,
        attemptId,
        "provider_submission_unknown",
        "Video creation could not be safely resumed. Please create a new video.",
        leaseId,
      );
      return;
    }
    try {
      const artwork = await this.objects.readInput(record.inputObjectKey);
      const attempt = this.attemptFrom(record, artwork);
      const lifecycle = {
        beforeSubmission: async (message: string) => {
          // Both intent gates must explicitly allow the request and generated brief before
          // a video credit or daily paid-video slot is consumed.
          await this.billableAttempts.reserve(ownerId, attemptId);
          await this.records.markProviderSubmitting(ownerId, attemptId, message, leaseId);
        },
        operationObserved: (operationId: string) =>
          this.records.attachProviderOperation(ownerId, attemptId, operationId, leaseId),
        providerOutputObserved: async (video: { bytes: Uint8Array }) => {
          const stored = await this.objects.publishProviderOutput({
            ownerId,
            attemptId,
            bytes: video.bytes,
          });
          await this.records.attachProviderOutput(ownerId, attemptId, stored, leaseId);
        },
      };
      const outcome = record.rawProviderObjectKey !== undefined &&
          record.personalizedMessage !== undefined
        ? await this.models.finish(
            record.modelProfileVersion,
            await this.objects.readProviderOutput(record.rawProviderObjectKey),
            record.personalizedMessage,
            record.localeIdentifier,
          )
        : record.state === "providerSubmitting" &&
          record.providerOperationId !== undefined &&
          record.personalizedMessage !== undefined
        ? await this.models.resume(
            record.modelProfileVersion,
            record.providerOperationId,
            record.personalizedMessage,
            record.localeIdentifier,
            lifecycle,
          )
        : await this.models.create(record.modelProfileVersion, attempt, lifecycle);
      if (outcome.kind === "rejected") {
        await this.records.reject(ownerId, attemptId, outcome.userMessage, leaseId);
        return;
      }
      const stored = await this.objects.publish({
        ownerId,
        attemptId,
        ...outcome.movie,
      });
      await this.records.complete(ownerId, attemptId, stored, outcome.message, leaseId);
    } catch (error) {
      if (error instanceof ProcessingLeaseLostError) return;
      const currentLease = await this.records.findOwned(ownerId, attemptId);
      if (currentLease?.processingLeaseId !== leaseId) return;
      if (error instanceof DailySpendLimitError) {
        await this.records.fail(
          ownerId,
          attemptId,
          "daily_spend_limit_reached",
          "Today's video creation limit has been reached. Please try again tomorrow.",
          leaseId,
        );
        return;
      }
      if (error instanceof NoGenerationCreditsError) {
        await this.records.fail(
          ownerId,
          attemptId,
          "generation_credits_required",
          "Your two welcome videos have been used. Add a credit pack to create another.",
          leaseId,
        );
        return;
      }
      const latest = await this.records.findOwned(ownerId, attemptId);
      if (latest?.state === "providerSubmitting" && latest.providerOperationId === undefined) {
        await this.records.fail(
          ownerId,
          attemptId,
          "provider_submission_unknown",
          "Video creation could not be safely resumed. Please create a new video.",
          leaseId,
        );
        return;
      }
      const failure = await this.records.recordProcessingFailure(
        ownerId,
        attemptId,
        MAX_PROCESSING_ATTEMPTS,
        leaseId,
      );
      if (failure.terminal) return;
      throw error;
    }
  }

  async findOwned(ownerId: string, attemptId: string): Promise<JobSnapshot | null> {
    const staleBefore = new Date(this.now().getTime() - STALE_PROCESSING_GRACE_MS);
    let record = await this.records.failIfStale(ownerId, attemptId, staleBefore);
    if (record?.state === "accepting" && record.inputObjectKey !== undefined) {
      const task = await this.tasks.enqueue({ ownerId, attemptId });
      await this.records.markQueued(ownerId, attemptId, task.taskName);
      record = await this.records.findOwned(ownerId, attemptId);
    }
    return record === null ? null : this.snapshot(record);
  }

  private async snapshot(record: AttemptRecord): Promise<JobSnapshot> {
    if (record.state === "ready") {
      if (
        record.outputObjectKey === undefined ||
        record.personalizedMessage === undefined ||
        record.mediaType !== "video/mp4" ||
        record.byteCount === undefined ||
        record.sha256 === undefined ||
        record.durationSeconds === undefined
      ) {
        throw new Error("Ready record is missing immutable media metadata.");
      }
      const grant = await this.objects.createReadGrant(
        record.outputObjectKey,
        READ_GRANT_TTL_SECONDS,
      );
      return {
        kind: "ready",
        id: `movie_${record.attemptId}`,
        personalizedMessage: record.personalizedMessage,
        download: {
          url: grant.url,
          expiresAt: grant.expiresAt.toISOString(),
          mediaType: record.mediaType,
          byteCount: record.byteCount,
          sha256: record.sha256,
          durationSeconds: record.durationSeconds,
        },
      };
    }
    if (record.state === "blocked") {
      return {
        kind: "rejected",
        code: "devotional_request_not_allowed",
        message: record.userMessage ?? "Please keep your request devotional and respectful.",
      };
    }
    if (record.state === "failed" || record.state === "submissionUnknown") {
      return {
        kind: "failed",
        code: record.failureCode ?? "generation_temporarily_unavailable",
        message: record.userMessage ?? "Video creation is temporarily unavailable.",
      };
    }
    return this.processing(record.attemptId);
  }

  private processing(attemptId: string): JobSnapshot {
    return { kind: "processing", attemptId, retryAfterSeconds: RETRY_AFTER_SECONDS };
  }

  private attemptFrom(record: AttemptRecord, artwork: Uint8Array): CreationAttempt {
    return {
      id: record.attemptId,
      requestDigest: record.requestDigest,
      artwork,
      artworkSHA256: record.artworkSHA256,
      dedication: record.dedication,
      ...(record.recipientName === undefined ? {} : { recipientName: record.recipientName }),
      ...(record.occasion === undefined ? {} : { occasion: record.occasion }),
      localeIdentifier: record.localeIdentifier,
    };
  }
}

const ALLOW_ALL_BILLABLE_ATTEMPTS: BillableAttemptGuard = {
  reserve: async () => {},
};
