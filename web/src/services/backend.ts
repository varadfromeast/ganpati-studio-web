import { requestCredentials } from "./firebase";

export type GenerationEconomy = {
  credits: number;
  welcomeCredits?: number;
  purchasedCredits?: number;
};

export type VideoDownload = {
  url: string;
  expiresAt: string;
  mediaType: "video/mp4";
  byteCount: number;
  sha256: string;
  durationSeconds: number;
};

export type VideoSnapshot =
  | { kind: "processing"; attemptId: string; retryAfterSeconds: number }
  | { kind: "ready"; id: string; personalizedMessage: string; download: VideoDownload }
  | { kind: "rejected"; code: "devotional_request_not_allowed"; message: string }
  | {
      kind: "failed";
      code:
        | "generation_temporarily_unavailable"
        | "media_processing_failed"
        | "provider_submission_unknown"
        | "daily_spend_limit_reached"
        | "generation_credits_required";
      message: string;
    };

export type VideoRequest = {
  artwork: Blob;
  artworkSHA256: string;
  dedication: string;
  recipientName?: string;
  occasion?: string;
  localeIdentifier: "en-IN" | "hi-IN" | "mr-IN";
  attemptId: string;
};

export type EnhancedStillRequest = {
  source: Blob;
  sourceCompositionHash: string;
  prompt: string;
  invariants: string[];
};

export class BackendError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "BackendError";
    this.status = status;
    this.code = code;
  }
}

function backendOrigin(): string {
  const configured = import.meta.env.VITE_BACKEND_URL as string | undefined;
  if (!configured) {
    throw new BackendError(
      0,
      "backend_not_configured",
      "Cloud creation is not configured yet. Your local Design is safe.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new BackendError(0, "backend_not_configured", "Cloud creation has an invalid backend address.");
  }
  const loopback = parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "[::1]";
  const secure = parsed.protocol === "https:" || (import.meta.env.DEV && parsed.protocol === "http:" && loopback);
  if (!secure || parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname) !== configured.replace(/\/$/u, "")) {
    throw new BackendError(
      0,
      "backend_not_configured",
      "Cloud creation requires an exact HTTPS backend origin.",
    );
  }
  return parsed.origin;
}

export function hasBackendConfiguration(): boolean {
  return Boolean(import.meta.env.VITE_BACKEND_URL);
}

export type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 90_000;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAXIMUM_VIDEO_BYTES = 30 * 1024 * 1024;

// Keep one deadline around authentication, transport, and body consumption. The
// race also bounds SDK operations that do not accept an AbortSignal themselves.
async function withinDeadline<T>(
  options: RequestOptions,
  defaultTimeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  controller.signal.throwIfAborted();
  options.signal?.addEventListener("abort", abort, { once: true });
  const requested = options.timeoutMs ?? defaultTimeoutMs;
  const timeoutMs = Number.isFinite(requested) ? Math.max(1, Math.min(requested, defaultTimeoutMs)) : defaultTimeoutMs;
  const timer = setTimeout(() => controller.abort(new BackendError(
    0, "request_timeout", "The connection took too long. Your saved request is safe to check again.",
  )), timeoutMs);
  let onAbort: () => void = () => undefined;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([operation(controller.signal), interrupted]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

async function authenticatedResponse(path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  const origin = backendOrigin();
  const credentials = await requestCredentials();
  signal.throwIfAborted();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${credentials.idToken}`);
  headers.set("X-Firebase-AppCheck", credentials.appCheckToken);
  const response = await fetch(`${origin}${path}`, {
    ...init, headers, signal, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
  });
  if (response.ok) return response;
  let code = "request_failed";
  let message = "The request could not be completed. Please try again.";
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    signal.throwIfAborted();
    // Keep the safe fallback when the upstream body is not JSON.
  }
  throw new BackendError(response.status, code, message);
}

export async function fetchEconomy(options: RequestOptions = {}): Promise<GenerationEconomy> {
  return withinDeadline(options, REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await authenticatedResponse("/v1/generation-economy", {}, signal);
    return await response.json() as GenerationEconomy;
  });
}

export async function createDevotionalVideo(request: VideoRequest, options: RequestOptions = {}): Promise<VideoSnapshot> {
  const metadata = {
    artworkSHA256: request.artworkSHA256,
    dedication: request.dedication.trim(),
    ...(request.recipientName?.trim() ? { recipientName: request.recipientName.trim() } : {}),
    ...(request.occasion?.trim() ? { occasion: request.occasion.trim() } : {}),
    localeIdentifier: request.localeIdentifier,
  };
  const form = new FormData();
  form.append("artwork", request.artwork, "ganpati-design.png");
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }), "metadata.json");
  return withinDeadline(options, UPLOAD_TIMEOUT_MS, async (signal) => {
    const response = await authenticatedResponse("/v1/devotional-movies", {
      method: "POST", headers: { "Idempotency-Key": request.attemptId }, body: form,
    }, signal);
    return await response.json() as VideoSnapshot;
  });
}

export async function fetchVideoAttempt(attemptId: string, options: RequestOptions = {}): Promise<VideoSnapshot> {
  return withinDeadline(options, REQUEST_TIMEOUT_MS, async (signal) => {
    const response = await authenticatedResponse(`/v1/devotional-movies/attempts/${encodeURIComponent(attemptId)}`, {}, signal);
    return await response.json() as VideoSnapshot;
  });
}

export async function createEnhancedStill(request: EnhancedStillRequest, options: RequestOptions = {}): Promise<Blob> {
  const form = new FormData();
  form.append("source", request.source, "ganpati-design.png");
  form.append("metadata", new Blob([JSON.stringify({
    sourceCompositionHash: request.sourceCompositionHash, prompt: request.prompt, invariants: request.invariants,
  })], { type: "application/json" }), "metadata.json");
  return withinDeadline(options, 180_000, async (signal) => {
    const response = await authenticatedResponse("/v1/enhanced-stills", {
      method: "POST", headers: { "Idempotency-Key": request.sourceCompositionHash }, body: form,
    }, signal);
    if (response.headers.get("x-source-composition-hash") !== request.sourceCompositionHash) {
      throw new BackendError(502, "invalid_enhanced_still", "The enhanced artwork could not be verified.");
    }
    return response.blob();
  });
}

/** Download and verify before exposing any movie to playback or local storage. */
export async function downloadVideo(download: VideoDownload, options: RequestOptions = {}): Promise<Blob> {
  return withinDeadline(options, DOWNLOAD_TIMEOUT_MS, async (signal) => {
    let url: URL;
    try { url = new URL(download.url); } catch { throw invalidVideo("The finished video address was not recognized."); }
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw invalidVideo("The finished video requires a secure download address.");
    }
    if (download.mediaType !== "video/mp4" || !Number.isSafeInteger(download.byteCount)
      || download.byteCount <= 0 || download.byteCount > MAXIMUM_VIDEO_BYTES || !/^[a-f0-9]{64}$/u.test(download.sha256)) {
      throw invalidVideo("The finished video details could not be verified.");
    }
    const response = await fetch(url.href, {
      signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", redirect: "error",
    });
    if (!response.ok) throw new BackendError(response.status, "download_failed", "The finished video could not be downloaded yet.");
    const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (mediaType && mediaType !== "video/mp4") throw invalidVideo("The finished video format was not recognized.");
    const declaredSize = response.headers.get("content-length");
    if (declaredSize !== null && Number(declaredSize) !== download.byteCount) {
      throw invalidVideo("The finished video size did not pass its integrity check.");
    }
    if (!response.body) throw invalidVideo("The finished video was empty.");
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let byteCount = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        byteCount += value.byteLength;
        if (byteCount > download.byteCount) throw invalidVideo("The finished video exceeded its expected size.");
        chunks.push(new Uint8Array(value));
      }
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (byteCount !== download.byteCount) throw invalidVideo("The finished video size did not pass its integrity check.");
    const movie = new Blob(chunks, { type: "video/mp4" });
    if (await sha256(movie) !== download.sha256) throw invalidVideo("The finished video did not pass its integrity check.");
    signal.throwIfAborted();
    return movie;
  });
}

function invalidVideo(message: string): BackendError {
  return new BackendError(502, "invalid_video", message);
}

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
