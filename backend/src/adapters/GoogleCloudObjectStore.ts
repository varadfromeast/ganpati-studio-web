import { Storage } from "@google-cloud/storage";
import { createHash } from "node:crypto";
import type {
  DownloadGrant,
  FinishedMovie,
  PrivateObjectStore,
  SourceArtwork,
  StoredInput,
  StoredMovie,
  StoredProviderVideo,
} from "../devotional-movie/contracts.js";

type GoogleError = Error & { code?: number };

export class GoogleCloudObjectStore implements PrivateObjectStore {
  private readonly bucket;

  constructor(bucketName: string, storage: Storage = new Storage()) {
    this.bucket = storage.bucket(bucketName);
  }

  async publishInput(input: SourceArtwork): Promise<StoredInput> {
    const objectKey = `inputs/${input.ownerId}/${input.attemptId}.png`;
    await this.publishImmutable(objectKey, input.bytes, "image/png", input.sha256);
    return { objectKey };
  }

  async readInput(objectKey: string): Promise<Uint8Array> {
    const [bytes] = await this.bucket.file(objectKey).download();
    return bytes;
  }

  async publishProviderOutput(input: {
    ownerId: string;
    attemptId: string;
    bytes: Uint8Array;
  }): Promise<StoredProviderVideo> {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const objectKey = `provider-raw/${input.ownerId}/${input.attemptId}.mp4`;
    await this.publishImmutable(objectKey, input.bytes, "video/mp4", sha256);
    return { objectKey, byteCount: input.bytes.byteLength, sha256 };
  }

  async readProviderOutput(objectKey: string) {
    const [bytes] = await this.bucket.file(objectKey).download();
    return { bytes };
  }

  async publish(input: FinishedMovie): Promise<StoredMovie> {
    const objectKey = `movies/${input.ownerId}/${input.attemptId}.mp4`;
    await this.publishImmutable(objectKey, input.bytes, input.mediaType, input.sha256);
    const { bytes: _bytes, ownerId: _ownerId, attemptId: _attemptId, ...metadata } = input;
    void _bytes;
    void _ownerId;
    void _attemptId;
    return { objectKey, ...metadata };
  }

  async createReadGrant(objectKey: string, ttlSeconds: number): Promise<DownloadGrant> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const [url] = await this.bucket.file(objectKey).getSignedUrl({
      version: "v4",
      action: "read",
      expires: expiresAt,
    });
    return { url, expiresAt };
  }

  private async publishImmutable(
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
    sha256: string,
  ): Promise<void> {
    const file = this.bucket.file(objectKey);
    try {
      await file.save(Buffer.from(bytes), {
        resumable: false,
        contentType,
        metadata: { metadata: { sha256 } },
        preconditionOpts: { ifGenerationMatch: 0 },
        validation: "crc32c",
      });
    } catch (error) {
      if ((error as GoogleError).code !== 412) throw error;
      const [metadata] = await file.getMetadata();
      if (metadata.metadata?.["sha256"] !== sha256) {
        throw new Error("Deterministic object key already exists with different content.");
      }
    }
  }
}
