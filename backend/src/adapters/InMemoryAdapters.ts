import { AttemptLifecycle } from "../devotional-movie/AttemptLifecycle.js";
import { createHash } from "node:crypto";
import {
  POLICY_VERSION,
  type AttemptRecord,
  type ClaimResult,
  type CreationAttempt,
  type CreationRecordStore,
  type DurableTaskQueue,
  type EnqueuedTask,
  type FailureCode,
  type FinishedMovie,
  type LeaseResult,
  type PrivateObjectStore,
  type ProcessingFailureResult,
  type ProcessAttemptTask,
  type SourceArtwork,
  type StoredInput,
  type StoredMovie,
  type StoredProviderVideo,
  type DownloadGrant,
} from "../devotional-movie/contracts.js";

function recordKey(ownerId: string, attemptId: string): string {
  return `${ownerId}_${attemptId}`;
}

export class InMemoryCreationRecordStore implements CreationRecordStore {
  readonly records = new Map<string, AttemptRecord>();
  private readonly now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  async claim(
    ownerId: string,
    attempt: CreationAttempt,
    modelProfileVersion: string,
  ): Promise<ClaimResult> {
    const key = recordKey(ownerId, attempt.id);
    const existing = this.records.get(key);
    if (existing !== undefined) {
      return existing.requestDigest === attempt.requestDigest
        ? { kind: "existing", record: structuredClone(existing) }
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
    this.records.set(key, record);
    return { kind: "created", record: structuredClone(record) };
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
    const record = this.records.get(recordKey(ownerId, attemptId));
    return record === undefined ? null : structuredClone(record);
  }

  private transition<T>(ownerId: string, attemptId: string, apply: (lifecycle: AttemptLifecycle) => T): Promise<T>;
  private transition<T>(ownerId: string, attemptId: string, apply: (lifecycle: AttemptLifecycle) => T, allowMissing: true): Promise<T | null>;
  private async transition<T>(
    ownerId: string, attemptId: string, apply: (lifecycle: AttemptLifecycle) => T, allowMissing = false,
  ): Promise<T | null> {
    const key = recordKey(ownerId, attemptId);
    const stored = this.records.get(key);
    if (stored === undefined) {
      if (allowMissing) return null;
      throw new Error("Attempt record not found.");
    }
    if (stored.ownerId !== ownerId) throw new Error("Attempt owner mismatch.");
    // Match transaction isolation: failed transitions cannot partially mutate storage.
    const record = structuredClone(stored);
    const result = apply(new AttemptLifecycle(record, this.now()));
    this.records.set(key, record);
    return structuredClone(result);
  }

}

export class InMemoryObjectStore implements PrivateObjectStore {
  readonly objects = new Map<string, Uint8Array>();
  readonly grants: string[] = [];
  private grantSequence = 0;

  async publishInput(input: SourceArtwork): Promise<StoredInput> {
    const objectKey = `inputs/${input.ownerId}/${input.attemptId}.png`;
    const existing = this.objects.get(objectKey);
    if (existing !== undefined) {
      const existingSHA256 = createHash("sha256").update(existing).digest("hex");
      if (existingSHA256 !== input.sha256) {
        throw new Error("Deterministic object key already exists with different content.");
      }
      return { objectKey };
    }
    this.objects.set(objectKey, input.bytes.slice());
    return { objectKey };
  }

  async readInput(objectKey: string): Promise<Uint8Array> {
    const bytes = this.objects.get(objectKey);
    if (bytes === undefined) throw new Error("Input object not found.");
    return bytes.slice();
  }

  async publishProviderOutput(input: {
    ownerId: string;
    attemptId: string;
    bytes: Uint8Array;
  }): Promise<StoredProviderVideo> {
    const objectKey = `provider-raw/${input.ownerId}/${input.attemptId}.mp4`;
    this.objects.set(objectKey, input.bytes.slice());
    return {
      objectKey,
      byteCount: input.bytes.byteLength,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
    };
  }

  async readProviderOutput(objectKey: string) {
    const bytes = this.objects.get(objectKey);
    if (bytes === undefined) throw new Error("Provider output not found.");
    return { bytes: bytes.slice() };
  }

  async publish(input: FinishedMovie): Promise<StoredMovie> {
    const objectKey = `movies/${input.ownerId}/${input.attemptId}.mp4`;
    this.objects.set(objectKey, input.bytes.slice());
    const { bytes: _bytes, ownerId: _ownerId, attemptId: _attemptId, ...metadata } = input;
    void _bytes;
    void _ownerId;
    void _attemptId;
    return { objectKey, ...metadata };
  }

  async createReadGrant(objectKey: string, ttlSeconds: number): Promise<DownloadGrant> {
    if (!this.objects.has(objectKey)) throw new Error("Movie object not found.");
    this.grantSequence += 1;
    const url = `https://private.invalid/${encodeURIComponent(objectKey)}?grant=${this.grantSequence}`;
    this.grants.push(url);
    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }
}

export class InMemoryTaskQueue implements DurableTaskQueue {
  readonly tasks = new Map<string, ProcessAttemptTask>();

  async enqueue(input: ProcessAttemptTask): Promise<EnqueuedTask> {
    const taskName = `devotional-${createHash("sha256")
      .update(`${input.ownerId}:${input.attemptId}`)
      .digest("hex")
      .slice(0, 32)}`;
    if (!this.tasks.has(taskName)) this.tasks.set(taskName, structuredClone(input));
    return { taskName };
  }
}
