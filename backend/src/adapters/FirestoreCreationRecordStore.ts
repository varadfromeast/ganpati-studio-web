import { AttemptLifecycle } from "../devotional-movie/AttemptLifecycle.js";
import {
  Firestore,
  Timestamp,
  type DocumentData,
  type DocumentReference,
} from "@google-cloud/firestore";
import {
  POLICY_VERSION,
  type AttemptRecord,
  type ClaimResult,
  type CreationAttempt,
  type CreationRecordStore,
  type FailureCode,
  type LeaseResult,
  type ProcessingFailureResult,
  type StoredMovie,
  type StoredProviderVideo,
} from "../devotional-movie/contracts.js";

const COLLECTION = "devotionalMovieAttempts";

export class FirestoreCreationRecordStore implements CreationRecordStore {
  constructor(
    private readonly firestore: Firestore = new Firestore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async claim(
    ownerId: string,
    attempt: CreationAttempt,
    modelProfileVersion: string,
  ): Promise<ClaimResult> {
    return this.firestore.runTransaction(async (transaction) => {
      const reference = this.reference(ownerId, attempt.id);
      const snapshot = await transaction.get(reference);
      if (snapshot.exists) {
        const existing = decodeRecord(snapshot.data());
        return existing.requestDigest === attempt.requestDigest
          ? { kind: "existing", record: existing }
          : { kind: "conflict" };
      }
      const now = this.now();
      const record: AttemptRecord = {
        ownerId,
        attemptId: attempt.id,
        requestDigest: attempt.requestDigest,
        artworkSHA256: attempt.artworkSHA256,
        dedication: attempt.dedication,
        ...(attempt.recipientName === undefined ? {} : { recipientName: attempt.recipientName }),
        ...(attempt.occasion === undefined ? {} : { occasion: attempt.occasion }),
        localeIdentifier: attempt.localeIdentifier,
        state: "accepting",
        policyVersion: POLICY_VERSION,
        modelProfileVersion,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      };
      transaction.create(reference, encodeRecord(record));
      return { kind: "created", record };
    });
  }

  async attachInput(ownerId: string, attemptId: string, objectKey: string): Promise<void> {
    await this.transition(ownerId, attemptId, lifecycle => lifecycle.attachInput(objectKey));
  }

  async markQueued(ownerId: string, attemptId: string, queueTaskName: string): Promise<void> {
    await this.transition(ownerId, attemptId, lifecycle => lifecycle.markQueued(queueTaskName));
  }

  async beginProcessing(ownerId: string, attemptId: string, leaseSeconds: number): Promise<LeaseResult> {
    return await this.transition(ownerId, attemptId, lifecycle => lifecycle.beginProcessing(leaseSeconds), true)
      ?? { kind: "notAcquired", record: null };
  }

  async recordProcessingFailure(ownerId: string, attemptId: string, maxFailures: number, leaseId?: string): Promise<ProcessingFailureResult> {
    return this.transition(ownerId, attemptId, lifecycle => lifecycle.recordProcessingFailure(maxFailures, leaseId));
  }

  async failIfStale(ownerId: string, attemptId: string, staleBefore: Date): Promise<AttemptRecord | null> {
    return this.transition(ownerId, attemptId, lifecycle => lifecycle.failIfStale(staleBefore), true);
  }

  async markProviderSubmitting(ownerId: string, attemptId: string, message: string, leaseId?: string): Promise<void> {
    await this.transition(ownerId, attemptId, lifecycle => lifecycle.markProviderSubmitting(message, leaseId));
  }

  async attachProviderOperation(ownerId: string, attemptId: string, operationId: string, leaseId?: string): Promise<void> {
    await this.transition(ownerId, attemptId, lifecycle => lifecycle.attachProviderOperation(operationId, leaseId));
  }

  async attachProviderOutput(ownerId: string, attemptId: string, output: StoredProviderVideo, leaseId?: string): Promise<void> {
    await this.transition(ownerId, attemptId, lifecycle => lifecycle.attachProviderOutput(output, leaseId));
  }

  async complete(ownerId: string, attemptId: string, movie: StoredMovie, message: string, leaseId?: string): Promise<void> {
    await this.transition(ownerId, attemptId, lifecycle => lifecycle.complete(movie, message, leaseId));
  }

  async reject(ownerId: string, attemptId: string, userMessage: string, leaseId?: string): Promise<void> {
    await this.transition(ownerId, attemptId, lifecycle => lifecycle.reject(userMessage, leaseId));
  }

  async fail(ownerId: string, attemptId: string, code: FailureCode, userMessage: string, leaseId?: string): Promise<void> {
    await this.transition(ownerId, attemptId, lifecycle => lifecycle.fail(code, userMessage, leaseId));
  }

  async findOwned(ownerId: string, attemptId: string): Promise<AttemptRecord | null> {
    const snapshot = await this.reference(ownerId, attemptId).get();
    if (!snapshot.exists) return null;
    const record = decodeRecord(snapshot.data());
    return record.ownerId === ownerId ? record : null;
  }

  private transition<T>(ownerId: string, attemptId: string, apply: (lifecycle: AttemptLifecycle) => T): Promise<T>;
  private transition<T>(ownerId: string, attemptId: string, apply: (lifecycle: AttemptLifecycle) => T, allowMissing: true): Promise<T | null>;
  private async transition<T>(
    ownerId: string, attemptId: string, apply: (lifecycle: AttemptLifecycle) => T, allowMissing = false,
  ): Promise<T | null> {
    return this.firestore.runTransaction(async transaction => {
      const reference = this.reference(ownerId, attemptId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        if (allowMissing) return null;
        throw new Error("Attempt record not found.");
      }
      const record = decodeRecord(snapshot.data());
      if (record.ownerId !== ownerId) throw new Error("Attempt owner mismatch.");
      const before = encodeRecord(record);
      const result = apply(new AttemptLifecycle(record, this.now()));
      const after = encodeRecord(record);
      // Read-only polls and denied lease acquisitions must not incur a write.
      if (JSON.stringify(before) !== JSON.stringify(after)) transaction.set(reference, after);
      return result;
    });
  }

  private reference(ownerId: string, attemptId: string): DocumentReference {
    return this.firestore.collection(COLLECTION).doc(`${ownerId}_${attemptId}`);
  }
}

function encodeRecord(record: AttemptRecord): DocumentData {
  return {
    ...record,
    createdAt: Timestamp.fromDate(record.createdAt),
    expiresAt: Timestamp.fromDate(record.expiresAt),
    ...(record.leaseExpiresAt === undefined
      ? {}
      : { leaseExpiresAt: Timestamp.fromDate(record.leaseExpiresAt) }),
    ...(record.lastProcessingFailureAt === undefined
      ? {}
      : { lastProcessingFailureAt: Timestamp.fromDate(record.lastProcessingFailureAt) }),
    ...(record.providerSubmissionStartedAt === undefined
      ? {}
      : { providerSubmissionStartedAt: Timestamp.fromDate(record.providerSubmissionStartedAt) }),
    ...(record.completedAt === undefined
      ? {}
      : { completedAt: Timestamp.fromDate(record.completedAt) }),
  };
}

function decodeRecord(data: DocumentData | undefined): AttemptRecord {
  if (data === undefined) throw new Error("Attempt record has no data.");
  return {
    ownerId: requiredString(data, "ownerId"),
    attemptId: requiredString(data, "attemptId"),
    requestDigest: requiredString(data, "requestDigest"),
    artworkSHA256: requiredString(data, "artworkSHA256"),
    dedication: requiredString(data, "dedication"),
    ...(optionalString(data, "recipientName") === undefined
      ? {}
      : { recipientName: optionalString(data, "recipientName") }),
    ...(optionalString(data, "occasion") === undefined
      ? {}
      : { occasion: optionalString(data, "occasion") }),
    localeIdentifier: requiredString(data, "localeIdentifier"),
    state: requiredString(data, "state") as AttemptRecord["state"],
    ...(optionalString(data, "inputObjectKey") === undefined ? {} : { inputObjectKey: optionalString(data, "inputObjectKey") }),
    ...(optionalString(data, "queueTaskName") === undefined ? {} : { queueTaskName: optionalString(data, "queueTaskName") }),
    ...(optionalDate(data, "leaseExpiresAt") === undefined ? {} : { leaseExpiresAt: optionalDate(data, "leaseExpiresAt") }),
    ...(optionalString(data, "processingLeaseId") === undefined ? {} : { processingLeaseId: optionalString(data, "processingLeaseId") }),
    ...(optionalNumber(data, "processingAttemptCount") === undefined ? {} : { processingAttemptCount: optionalNumber(data, "processingAttemptCount") }),
    ...(optionalNumber(data, "processingFailureCount") === undefined ? {} : { processingFailureCount: optionalNumber(data, "processingFailureCount") }),
    ...(optionalDate(data, "lastProcessingFailureAt") === undefined ? {} : { lastProcessingFailureAt: optionalDate(data, "lastProcessingFailureAt") }),
    ...(optionalDate(data, "providerSubmissionStartedAt") === undefined ? {} : { providerSubmissionStartedAt: optionalDate(data, "providerSubmissionStartedAt") }),
    ...(optionalString(data, "providerOperationId") === undefined ? {} : { providerOperationId: optionalString(data, "providerOperationId") }),
    ...(optionalString(data, "rawProviderObjectKey") === undefined ? {} : { rawProviderObjectKey: optionalString(data, "rawProviderObjectKey") }),
    ...(optionalNumber(data, "rawProviderByteCount") === undefined ? {} : { rawProviderByteCount: optionalNumber(data, "rawProviderByteCount") }),
    ...(optionalString(data, "rawProviderSHA256") === undefined ? {} : { rawProviderSHA256: optionalString(data, "rawProviderSHA256") }),
    policyVersion: requiredString(data, "policyVersion"),
    modelProfileVersion: requiredString(data, "modelProfileVersion"),
    ...(optionalString(data, "personalizedMessage") === undefined ? {} : { personalizedMessage: optionalString(data, "personalizedMessage") }),
    ...(optionalString(data, "outputObjectKey") === undefined ? {} : { outputObjectKey: optionalString(data, "outputObjectKey") }),
    ...(optionalString(data, "mediaType") === undefined ? {} : { mediaType: optionalString(data, "mediaType") as "video/mp4" }),
    ...(optionalNumber(data, "byteCount") === undefined ? {} : { byteCount: optionalNumber(data, "byteCount") }),
    ...(optionalString(data, "sha256") === undefined ? {} : { sha256: optionalString(data, "sha256") }),
    ...(optionalNumber(data, "durationSeconds") === undefined ? {} : { durationSeconds: optionalNumber(data, "durationSeconds") }),
    ...(optionalString(data, "failureCode") === undefined ? {} : { failureCode: optionalString(data, "failureCode") as FailureCode }),
    ...(optionalString(data, "userMessage") === undefined ? {} : { userMessage: optionalString(data, "userMessage") }),
    createdAt: requiredDate(data, "createdAt"),
    ...(optionalDate(data, "completedAt") === undefined ? {} : { completedAt: optionalDate(data, "completedAt") }),
    expiresAt: requiredDate(data, "expiresAt"),
  } as AttemptRecord;
}

function requiredString(data: DocumentData, key: string): string {
  const value = data[key];
  if (typeof value !== "string") throw new Error(`Attempt record ${key} is invalid.`);
  return value;
}

function optionalString(data: DocumentData, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(data: DocumentData, key: string): number | undefined {
  const value = data[key];
  return typeof value === "number" ? value : undefined;
}

function requiredDate(data: DocumentData, key: string): Date {
  const value = data[key];
  if (!(value instanceof Timestamp)) throw new Error(`Attempt record ${key} is invalid.`);
  return value.toDate();
}

function optionalDate(data: DocumentData, key: string): Date | undefined {
  const value = data[key];
  return value instanceof Timestamp ? value.toDate() : undefined;
}
