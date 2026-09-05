import { z } from "zod";
import { createHash } from "node:crypto";
import { validateSourcePNG } from "../media/pngValidation.js";

const ImageResponseSchema = z.object({
  data: z.array(z.object({ b64_json: z.string().min(1) })).min(1),
});

export type EnhancedStillInput = {
  sourcePNG: Uint8Array;
  sourceCompositionHash: string;
  prompt: string;
  invariants: string[];
};

export interface EnhancedStillGenerating {
  generate(input: EnhancedStillInput): Promise<Uint8Array>;
}

/**
 * The backend-owned enhanced-still module. Its small interface hides provider credentials,
 * multipart encoding, bounded transient retries, response validation, and size limits.
 */
export class OpenAIEnhancedStillGenerator implements EnhancedStillGenerating {
  constructor(
    private readonly apiKey: string,
    private readonly endpoint = "https://api.openai.com/v1/images/edits",
    private readonly request: typeof fetch = fetch,
    private readonly wait: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    if (apiKey.trim().length === 0) throw new Error("OPENAI_API_KEY is required.");
  }

  async generate(input: EnhancedStillInput): Promise<Uint8Array> {
    validateInput(input);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.request(this.endpoint, {
          method: "POST",
          headers: { authorization: `Bearer ${this.apiKey}` },
          body: requestBody(input),
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < 2) {
            await this.wait(250 * (2 ** attempt));
            continue;
          }
          throw new Error(`Enhanced still provider failed with status ${response.status}.`);
        }
        const payload = ImageResponseSchema.parse(await response.json());
        const bytes = Buffer.from(payload.data[0]!.b64_json, "base64");
        if (bytes.byteLength > 20 * 1024 * 1024) {
          throw new Error("Enhanced still provider returned an invalid PNG.");
        }
        try {
          validateSourcePNG(bytes);
        } catch {
          throw new Error("Enhanced still provider returned an invalid PNG.");
        }
        return bytes;
      } catch (error) {
        if (attempt >= 2 || !isTransient(error)) throw error;
        await this.wait(250 * (2 ** attempt));
      }
    }
    throw new Error("Enhanced still generation exhausted retries.");
  }
}

function validateInput(input: EnhancedStillInput): void {
  if (input.sourcePNG.byteLength > 15 * 1024 * 1024) {
    throw new Error("Enhanced still source must be a PNG under 15 MB.");
  }
  try {
    validateSourcePNG(input.sourcePNG);
  } catch {
    throw new Error("Enhanced still source must be a valid, bounded PNG under 15 MB.");
  }
  if (!/^[a-f0-9]{64}$/u.test(input.sourceCompositionHash)) {
    throw new Error("Enhanced still source hash is invalid.");
  }
  const actualHash = createHash("sha256").update(input.sourcePNG).digest("hex");
  if (actualHash !== input.sourceCompositionHash) {
    throw new Error("Enhanced still source hash does not match its bytes.");
  }
  if (input.prompt.trim().length < 20 || input.prompt.length > 4_000) {
    throw new Error("Enhanced still prompt is invalid.");
  }
  if (input.invariants.length === 0 || input.invariants.length > 16) {
    throw new Error("Enhanced still invariants are invalid.");
  }
}

function requestBody(input: EnhancedStillInput): FormData {
  const body = new FormData();
  body.set("model", "gpt-image-2");
  body.set("prompt", `${input.prompt}\nRequired invariants: ${input.invariants.join(", ")}.`);
  body.set("size", "1024x1536");
  body.set("quality", "high");
  body.set("output_format", "png");
  body.set(
    "image[]",
    new Blob([Uint8Array.from(input.sourcePNG)], { type: "image/png" }),
    "composition.png",
  );
  return body;
}

function isTransient(error: unknown): boolean {
  return error instanceof TypeError ||
    (error instanceof DOMException && error.name === "TimeoutError");
}
