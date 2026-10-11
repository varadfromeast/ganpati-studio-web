import type { RequestHandler } from "express";
import { z } from "zod";
import type { EnhancedStillGenerating } from "../enhanced-still/EnhancedStillModule.js";
import { HttpError } from "../devotional-movie/errors.js";
import { sha256 } from "../devotional-movie/validation.js";
import { PNGValidationError, validateSourcePNG } from "../media/pngValidation.js";

const MetadataSchema = z.object({
  sourceCompositionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  prompt: z.string().min(20).max(4_000),
  invariants: z.array(z.string().min(1).max(80)).min(1).max(16),
}).strict();

export function createEnhancedStill(generator: EnhancedStillGenerating): RequestHandler {
  return async (request, response, next) => {
    try {
      const files = request.files as Record<string, Express.Multer.File[]> | undefined;
      const source = files?.["source"]?.[0];
      const metadataFile = files?.["metadata"]?.[0];
      if (source?.mimetype !== "image/png" || metadataFile === undefined) {
        throw new HttpError(400, "invalid_enhanced_still", "Enhanced still request is invalid.");
      }
      const metadata = MetadataSchema.parse(JSON.parse(metadataFile.buffer.toString("utf8")));
      try {
        validateSourcePNG(source.buffer);
      } catch (error) {
        if (error instanceof PNGValidationError) {
          throw new HttpError(400, "invalid_enhanced_still", "Enhanced still source PNG is invalid.");
        }
        throw error;
      }
      if (sha256(source.buffer) !== metadata.sourceCompositionHash) {
        throw new HttpError(400, "enhanced_still_digest_mismatch", "Enhanced still source checksum does not match.");
      }
      const bytes = await generator.generate({
        sourcePNG: source.buffer,
        sourceCompositionHash: metadata.sourceCompositionHash,
        prompt: metadata.prompt,
        invariants: metadata.invariants,
      });
      response.set({
        "content-type": "image/png",
        "cache-control": "private, no-store",
        "x-source-composition-hash": metadata.sourceCompositionHash,
      }).status(200).send(Buffer.from(bytes));
    } catch (error) {
      if (error instanceof HttpError) return next(error);
      if (error instanceof SyntaxError || error instanceof z.ZodError) {
        return next(new HttpError(400, "invalid_enhanced_still", "Enhanced still request is invalid."));
      }
      next(error);
    }
  };
}
