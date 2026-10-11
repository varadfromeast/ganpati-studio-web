import type { NextFunction, Response } from "express";
import { z } from "zod";
import type { DevotionalMovieJobs } from "../devotional-movie/contracts.js";
import { canonicalRequestDigest, hasGraphemeLength } from "../devotional-movie/validation.js";
import { HttpError } from "../devotional-movie/errors.js";
import type { AuthenticatedRequest } from "./authenticate.js";

const MetadataSchema = z.object({
  artworkSHA256: z.string().regex(/^[0-9a-f]{64}$/i),
  dedication: z.string().refine((value) => hasGraphemeLength(value, 1, 240)),
  recipientName: z.string().refine((value) => hasGraphemeLength(value, 0, 80)).optional(),
  occasion: z.string().refine((value) => hasGraphemeLength(value, 0, 100)).optional(),
  localeIdentifier: z.enum(["en-IN", "hi-IN", "mr-IN"]),
}).strict();

export function createDevotionalMovie(jobs: DevotionalMovieJobs) {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    try {
      const ownerId = request.principal?.ownerId;
      if (ownerId === undefined) throw new HttpError(401, "unauthorized", "Authentication is required.");
      const attemptId = request.header("idempotency-key");
      if (attemptId === undefined) {
        throw new HttpError(400, "missing_idempotency_key", "Idempotency-Key is required.");
      }
      const files = request.files;
      const fileMap = files === undefined || Array.isArray(files) ? undefined : files;
      const artwork = fileMap?.["artwork"]?.[0];
      const metadataPart = fileMap?.["metadata"]?.[0];
      if (artwork === undefined || metadataPart === undefined) {
        throw new HttpError(400, "missing_multipart_part", "Artwork and metadata are required.");
      }
      let rawMetadata: unknown;
      try {
        rawMetadata = JSON.parse(metadataPart.buffer.toString("utf8"));
      } catch {
        throw new HttpError(400, "invalid_metadata", "Metadata must be valid JSON.");
      }
      const parsed = MetadataSchema.safeParse(rawMetadata);
      if (!parsed.success) {
        throw new HttpError(400, "invalid_metadata", "Metadata is invalid.");
      }
      const metadata = parsed.data;
      const requestDigest = canonicalRequestDigest({
        artworkSHA256: metadata.artworkSHA256,
        dedication: metadata.dedication,
        ...(metadata.recipientName === undefined ? {} : { recipientName: metadata.recipientName }),
        ...(metadata.occasion === undefined ? {} : { occasion: metadata.occasion }),
        localeIdentifier: metadata.localeIdentifier,
      });
      const snapshot = await jobs.submit(
        { ownerId },
        {
          id: attemptId,
          requestDigest,
          artwork: artwork.buffer,
          artworkSHA256: metadata.artworkSHA256.toLowerCase(),
          dedication: metadata.dedication,
          ...(metadata.recipientName === undefined ? {} : { recipientName: metadata.recipientName }),
          ...(metadata.occasion === undefined ? {} : { occasion: metadata.occasion }),
          localeIdentifier: metadata.localeIdentifier,
        },
      );
      const status = snapshot.kind === "processing" ? 202 : 200;
      if (snapshot.kind === "processing") response.set("Retry-After", String(snapshot.retryAfterSeconds));
      response.status(status).json(snapshot);
    } catch (error) {
      next(error);
    }
  };
}
