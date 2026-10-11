import { z } from "zod";
import type { VideoGenerator } from "../devotional-movie/contracts.js";

const InteractionSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  steps: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({
      type: z.string(),
      mime_type: z.string().optional(),
      data: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()),
}).passthrough();

export class GeminiOmniVideoGenerator implements VideoGenerator {
  constructor(
    private readonly apiKey: string,
    private readonly model = "gemini-omni-flash-preview",
    private readonly baseURL = "https://generativelanguage.googleapis.com/v1beta",
  ) {}

  async generate(
    input: Parameters<VideoGenerator["generate"]>[0],
    operationObserved: Parameters<VideoGenerator["generate"]>[1],
  ) {
    const response = await fetch(`${this.baseURL}/interactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            type: "image",
            data: Buffer.from(input.sourceArtwork).toString("base64"),
            mime_type: "image/png",
          },
          {
            type: "text",
            text: `${input.trustedPrompt}\nIn one continuous unbroken six-second shot with no scene cuts. Include gentle devotional ambience and preserve any reviewed spoken blessing exactly.`,
          },
        ],
        response_format: { type: "video", aspect_ratio: "9:16" },
        generation_config: { video_config: { task: "image_to_video" } },
        background: false,
        store: false,
        stream: false,
      }),
      signal: AbortSignal.timeout(9 * 60_000),
    });
    if (!response.ok) throw new Error(`Gemini Omni request failed with status ${response.status}.`);
    const completed = this.completedInteraction(await response.json());
    await operationObserved(completed.operationId);
    return { bytes: completed.bytes };
  }

  async resume(operationId: string) {
    const response = await fetch(
      `${this.baseURL}/interactions/${encodeURIComponent(operationId)}`,
      {
        headers: { "x-goog-api-key": this.apiKey },
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      throw new Error(`Gemini Omni recovery failed with status ${response.status}.`);
    }
    return { bytes: this.completedInteraction(await response.json()).bytes };
  }

  private completedInteraction(body: unknown) {
    const interaction = InteractionSchema.parse(body);
    const video = interaction.steps
      .flatMap((step) => step.content ?? [])
      .find((content) => content.type === "video" && content.mime_type === "video/mp4");
    if (interaction.status !== "completed" || video?.data === undefined) {
      throw new Error("Gemini Omni response did not contain a completed MP4.");
    }
    return {
      bytes: Buffer.from(video.data, "base64"),
      operationId: interaction.id,
    };
  }
}
