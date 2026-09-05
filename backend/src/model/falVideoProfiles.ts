import type { VideoInput } from "../devotional-movie/contracts.js";

export type FalImageToVideoProfile = {
  version: string;
  endpointId: string;
  buildInput(input: VideoInput, imageURL: string): Record<string, unknown>;
};

const commonInput = (input: VideoInput, imageURL: string) => ({
  image_url: imageURL,
  prompt: input.trustedPrompt,
  resolution: "720p",
  aspect_ratio: "9:16",
});

/**
 * Audited experiment profiles. The persisted version owns the exact endpoint and request shape,
 * so changing the active experiment never changes how an in-flight operation is resumed.
 */
export const FAL_DEVOTIONAL_VIDEO_PROFILES = [
  {
    version: "gemini-text-fal-ltx-2.5-pro-speaking-v1",
    endpointId: "lightricks/ltx-2.5/image-to-video/pro",
    buildInput: (input, imageURL) => ({
      ...commonInput(input, imageURL),
      duration: input.durationSeconds,
      fps: 25,
      generate_audio: true,
    }),
  },
  {
    version: "gemini-text-fal-gemini-omni-flash-speaking-v1",
    endpointId: "google/gemini-omni-flash/image-to-video",
    buildInput: (input, imageURL) => ({
      image_url: imageURL,
      prompt: input.trustedPrompt,
      duration: input.durationSeconds,
      aspect_ratio: "9:16",
    }),
  },
  {
    version: "gemini-text-fal-ltx-preview-cheap-v1",
    endpointId: "fal-ai/ltx-video/image-to-video",
    buildInput: (input, imageURL) => ({
      image_url: imageURL,
      prompt: input.trustedPrompt,
      guidance_scale: 3,
      num_inference_steps: 30,
      negative_prompt: "deformed, distorted, disfigured, altered face, altered trunk, extra limbs, extra hands, fused fingers, text, watermark",
    }),
  },
  {
    version: "gemini-text-fal-ltx-2.5-fast-v1",
    endpointId: "lightricks/ltx-2.5/image-to-video/fast",
    buildInput: (input, imageURL) => ({
      ...commonInput(input, imageURL),
      duration: input.durationSeconds,
      fps: 25,
      generate_audio: false,
    }),
  },
  {
    version: "gemini-text-fal-wan-2.2-turbo-v1",
    endpointId: "fal-ai/wan/v2.2-a14b/image-to-video/turbo",
    buildInput: (input, imageURL) => ({
      ...commonInput(input, imageURL),
      acceleration: "regular",
      video_quality: "high",
      video_write_mode: "fast",
      enable_prompt_expansion: false,
      enable_safety_checker: true,
      enable_output_safety_checker: true,
    }),
  },
  {
    version: "gemini-text-fal-grok-imagine-v1",
    endpointId: "xai/grok-imagine-video/image-to-video",
    buildInput: (input, imageURL) => ({
      ...commonInput(input, imageURL),
      duration: input.durationSeconds,
    }),
  },
  {
    version: "gemini-text-fal-seedance-2.0-fast-v1",
    endpointId: "bytedance/seedance-2.0/fast/image-to-video",
    buildInput: (input, imageURL) => ({
      ...commonInput(input, imageURL),
      duration: String(input.durationSeconds),
      generate_audio: false,
      bitrate_mode: "standard",
    }),
  },
] as const satisfies readonly FalImageToVideoProfile[];

/**
 * Audited speaking-video profiles retained as the benchmark catalog. LTX 2.5 Pro and Gemini Omni
 * are also production-selectable above; the remaining profiles stay benchmark-only.
 */
export const FAL_SPEAKING_VIDEO_PROFILES = [
  {
    version: "gemini-text-fal-gemini-omni-flash-speaking-v1",
    endpointId: "google/gemini-omni-flash/image-to-video",
    buildInput: (input, imageURL) => ({
      image_url: imageURL,
      prompt: input.trustedPrompt,
      duration: input.durationSeconds,
      aspect_ratio: "9:16",
    }),
  },
  {
    version: "gemini-text-fal-grok-imagine-1.5-speaking-v1",
    endpointId: "xai/grok-imagine-video/v1.5/image-to-video",
    buildInput: (input, imageURL) => ({
      image_url: imageURL,
      prompt: input.trustedPrompt,
      duration: input.durationSeconds,
      resolution: "720p",
    }),
  },
  {
    version: "gemini-text-fal-pixverse-c1-speaking-v1",
    endpointId: "fal-ai/pixverse/c1/image-to-video",
    buildInput: (input, imageURL) => ({
      image_url: imageURL,
      prompt: input.trustedPrompt,
      duration: input.durationSeconds,
      resolution: "720p",
      generate_audio_switch: true,
    }),
  },
  {
    version: "gemini-text-fal-ltx-2.5-pro-speaking-v1",
    endpointId: "lightricks/ltx-2.5/image-to-video/pro",
    buildInput: (input, imageURL) => ({
      ...commonInput(input, imageURL),
      duration: input.durationSeconds,
      fps: 25,
      generate_audio: true,
    }),
  },
  {
    version: "gemini-text-fal-wan-3.0-prime-speaking-v1",
    endpointId: "alibaba/wan-3.0-prime/image-to-video",
    buildInput: (input, imageURL) => ({
      start_image_url: imageURL,
      prompt: input.trustedPrompt,
      duration: input.durationSeconds,
      resolution: "720p",
      aspect_ratio: "9:16",
      audio: true,
      // Preserve the exact requested dialogue instead of allowing provider-side prompt rewriting.
      enable_prompt_expansion: false,
      enable_thinking: false,
      enable_safety_checker: true,
    }),
  },
  {
    version: "gemini-text-fal-kling-3-standard-speaking-v1",
    endpointId: "fal-ai/kling-video/v3/standard/image-to-video",
    buildInput: (input, imageURL) => ({
      start_image_url: imageURL,
      // Kling's schema explicitly recommends lowercase letters for English speech.
      prompt: input.trustedPrompt.replace("Happy Ganesh Chaturthi", "happy ganesh chaturthi"),
      duration: String(input.durationSeconds),
      generate_audio: true,
      shot_type: "customize",
      cfg_scale: 0.5,
      negative_prompt: "blur, distortion, altered face, altered trunk, extra limbs, extra hands, fused fingers, subtitles, text, watermark",
    }),
  },
  {
    version: "gemini-text-fal-veo-3.1-fast-speaking-v1",
    endpointId: "fal-ai/veo3.1/fast/image-to-video",
    buildInput: (input, imageURL) => ({
      ...commonInput(input, imageURL),
      duration: `${input.durationSeconds}s`,
      generate_audio: true,
      auto_fix: false,
      safety_tolerance: "4",
      negative_prompt: "deformed anatomy, altered face, altered trunk, extra limbs, extra hands, subtitles, text, watermark",
    }),
  },
] as const satisfies readonly FalImageToVideoProfile[];

export function falVideoProfile(version: string): FalImageToVideoProfile {
  const profile = FAL_DEVOTIONAL_VIDEO_PROFILES.find((candidate) => candidate.version === version);
  if (profile === undefined) throw new Error(`Unknown fal video profile ${version}.`);
  return profile;
}
