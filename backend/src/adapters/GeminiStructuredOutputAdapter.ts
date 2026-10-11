import type {
  StructuredModelPart,
  StructuredModelRequest,
  StructuredOutputModel,
} from "../model/StructuredDevotionalLanguageModel.js";

type GeminiContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/** Gemini Developer API adapter for the provider-neutral structured-output seam. */
export class GeminiStructuredOutputAdapter implements StructuredOutputModel {
  constructor(
    private readonly apiKey: string,
    private readonly baseURL = "https://generativelanguage.googleapis.com/v1beta",
  ) {}

  async generate(request: StructuredModelRequest): Promise<unknown> {
    const response = await fetch(
      `${this.baseURL}/models/${encodeURIComponent(request.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          contents: [{ role: "user", parts: request.parts.map(toGeminiPart) }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: request.outputSchema,
            temperature: request.temperature,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_LOW_AND_ABOVE" },
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_LOW_AND_ABOVE" },
          ],
        }),
        signal: AbortSignal.timeout(request.timeoutMilliseconds),
      },
    );
    if (!response.ok) {
      throw new Error(`Gemini structured-output request failed with status ${response.status}.`);
    }
    const body = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text === undefined) {
      throw new Error("Gemini structured-output response did not contain JSON text.");
    }
    return JSON.parse(text) as unknown;
  }
}

function toGeminiPart(part: StructuredModelPart): GeminiContentPart {
  if (part.kind === "text") return { text: part.text };
  return {
    inlineData: {
      mimeType: part.mediaType,
      data: Buffer.from(part.bytes).toString("base64"),
    },
  };
}
