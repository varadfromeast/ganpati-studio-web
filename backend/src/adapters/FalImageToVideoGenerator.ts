import { createFalClient } from "@fal-ai/client";
import { z } from "zod";
import type {
  ProviderOperationObserver,
  ProviderVideo,
  VideoGenerator,
  VideoInput,
} from "../devotional-movie/contracts.js";
import type { FalImageToVideoProfile } from "../model/falVideoProfiles.js";

const FalVideoResultSchema = z.object({
  video: z.object({
    url: z.string().url(),
    content_type: z.string().optional(),
  }).passthrough(),
}).passthrough();

type FalQueueStatus = { status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" };
type FalClientPort = {
  uploadImage(bytes: Uint8Array): Promise<string>;
  submit(endpointId: string, input: Record<string, unknown>): Promise<string>;
  status(endpointId: string, requestId: string): Promise<FalQueueStatus>;
  result(endpointId: string, requestId: string): Promise<unknown>;
};

const MAXIMUM_VIDEO_BYTES = 40 * 1024 * 1024;
const MAXIMUM_MEDIA_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// fal's current storage client and generated endpoint examples use these exact
// first-party media hosts. Deployments can replace/extend them explicitly when
// fal documents a new result host; arbitrary *.fal.media hosts are not trusted.
export const DEFAULT_FAL_MEDIA_HOSTS = ["v3.fal.media", "v3b.fal.media"] as const;

/** Server-only fal queue adapter. Credentials never cross this module or reach the iOS client. */
export class FalImageToVideoGenerator implements VideoGenerator {
  private readonly client: FalClientPort;

  constructor(
    apiKey: string,
    private readonly profile: FalImageToVideoProfile,
    client?: FalClientPort,
    private readonly fetchVideo: typeof fetch = fetch,
    private readonly wait: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly now: () => number = Date.now,
    allowedMediaHosts: readonly string[] = falMediaAllowedHostsFromEnvironment(),
  ) {
    this.client = client ?? falClientPort(apiKey);
    this.allowedMediaHosts = validateAllowedMediaHosts(allowedMediaHosts);
  }

  private readonly allowedMediaHosts: ReadonlySet<string>;

  async generate(input: VideoInput, operationObserved: ProviderOperationObserver) {
    const imageURL = await this.client.uploadImage(input.sourceArtwork);
    const requestId = await this.client.submit(
      this.profile.endpointId,
      this.profile.buildInput(input, imageURL),
    );
    await operationObserved(requestId);
    return await this.retrieve(requestId);
  }

  async resume(operationId: string) {
    return await this.retrieve(operationId);
  }

  private async retrieve(requestId: string): Promise<ProviderVideo> {
    const deadline = this.now() + 8 * 60_000;
    while (true) {
      const status = await this.client.status(this.profile.endpointId, requestId);
      if (status.status === "COMPLETED") break;
      if (this.now() >= deadline) {
        throw new Error("fal video operation is still processing and can be resumed safely.");
      }
      await this.wait(2_000);
    }

    const raw = await this.client.result(this.profile.endpointId, requestId);
    const result = FalVideoResultSchema.parse(raw);
    const response = await this.downloadMedia(result.video.url);
    if (!response.ok) throw new Error(`fal video download failed with status ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? result.video.content_type;
    if (contentType !== undefined && !contentType.startsWith("video/")) {
      throw new Error("fal result URL did not return video content.");
    }
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAXIMUM_VIDEO_BYTES) throw new Error("fal video exceeds byte limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAXIMUM_VIDEO_BYTES) {
      throw new Error("fal video is empty or exceeds byte limit.");
    }
    return { bytes };
  }

  private async downloadMedia(rawURL: string): Promise<Response> {
    let currentURL = validateMediaURL(rawURL, this.allowedMediaHosts);
    for (let redirects = 0; ; redirects += 1) {
      const response = await this.fetchVideo(currentURL.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(60_000),
      });
      if (!REDIRECT_STATUSES.has(response.status)) return response;
      if (redirects >= MAXIMUM_MEDIA_REDIRECTS) {
        throw new Error("fal video download exceeded the redirect limit.");
      }
      const location = response.headers.get("location");
      if (location === null) throw new Error("fal video redirect did not include a location.");
      currentURL = validateMediaURL(new URL(location, currentURL).toString(), this.allowedMediaHosts);
    }
  }
}

export function falMediaAllowedHostsFromEnvironment(
  raw = process.env["FAL_MEDIA_ALLOWED_HOSTS"],
): readonly string[] {
  if (raw === undefined || raw.trim().length === 0) return DEFAULT_FAL_MEDIA_HOSTS;
  return raw.split(",").map((host) => host.trim()).filter(Boolean);
}

function validateAllowedMediaHosts(hosts: readonly string[]): ReadonlySet<string> {
  const normalized = new Set<string>();
  for (const host of hosts) {
    const value = host.toLowerCase();
    if (value !== host || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(value)) {
      throw new Error("FAL_MEDIA_ALLOWED_HOSTS must contain exact lowercase hostnames.");
    }
    normalized.add(value);
  }
  if (normalized.size === 0) throw new Error("At least one fal media host must be allowed.");
  return normalized;
}

function validateMediaURL(rawURL: string, allowedHosts: ReadonlySet<string>): URL {
  let url: URL;
  try {
    url = new URL(rawURL);
  } catch {
    throw new Error("fal result URL is invalid.");
  }
  if (
    url.protocol !== "https:" ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.port.length > 0 ||
    !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new Error("fal result URL is not an allowed HTTPS media host.");
  }
  return url;
}

function falClientPort(apiKey: string): FalClientPort {
  const client = createFalClient({ credentials: apiKey });
  return {
    uploadImage: async (bytes) => await client.storage.upload(
      new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      { lifecycle: { expiresIn: "1h" } },
    ),
    submit: async (endpointId, input) => {
      const submitted = await client.queue.submit(endpointId, {
        input,
        priority: "normal",
        startTimeout: 60,
        storageSettings: { expiresIn: "1h" },
      });
      return submitted.request_id;
    },
    status: async (endpointId, requestId) =>
      await client.queue.status(endpointId, { requestId, logs: false }),
    result: async (endpointId, requestId) =>
      (await client.queue.result(endpointId, { requestId })).data,
  };
}
