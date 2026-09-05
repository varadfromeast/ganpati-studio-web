import { GoogleAuth } from "google-auth-library";
import type {
  StructuredModelPart,
  StructuredModelRequest,
  StructuredOutputModel,
} from "../model/StructuredDevotionalLanguageModel.js";

type VertexContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type AccessTokenProvider = () => Promise<string>;

/** Vertex adapter that authenticates with the Cloud Run service account. */
export class VertexStructuredOutputAdapter implements StructuredOutputModel {
  private readonly accessToken: AccessTokenProvider;

  constructor(
    private readonly projectId: string,
    private readonly location = "global",
    accessToken?: AccessTokenProvider,
    private readonly baseURL = "https://aiplatform.googleapis.com/v1",
  ) {
    if (accessToken !== undefined) {
      this.accessToken = accessToken;
      return;
    }
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    this.accessToken = async () => {
      const token = await auth.getAccessToken();
      if (token === null || token === undefined) {
        throw new Error("Vertex access token was unavailable.");
      }
      return token;
    };
  }

  async generate(request: StructuredModelRequest): Promise<unknown> {
    const token = await this.accessToken();
    const response = await fetch(
      `${this.baseURL}/projects/${encodeURIComponent(this.projectId)}`
      + `/locations/${encodeURIComponent(this.location)}/publishers/google/models/`
      + `${encodeURIComponent(request.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemInstruction }] },
          contents: [{ role: "user", parts: request.parts.map(toVertexPart) }],
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
      throw new Error(`Vertex structured-output request failed with status ${response.status}.`);
    }
    const body = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.find(
      (part) => part.text !== undefined,
    )?.text;
    if (text === undefined) {
      throw new Error("Vertex structured-output response did not contain JSON text.");
    }
    return JSON.parse(text) as unknown;
  }
}

function toVertexPart(part: StructuredModelPart): VertexContentPart {
  if (part.kind === "text") return { text: part.text };
  return {
    inlineData: {
      mimeType: part.mediaType,
      data: Buffer.from(part.bytes).toString("base64"),
    },
  };
}
