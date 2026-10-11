import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { MediaFinisher, ProviderVideo, VideoGenerator } from "./contracts.js";

const execFileAsync = promisify(execFile);

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
};
type ProbeResult = { streams?: ProbeStream[]; format?: { duration?: string } };

export class FFmpegStillVideoGenerator implements VideoGenerator {
  constructor(private readonly ffmpegPath = process.env["FFMPEG_PATH"] ?? "ffmpeg") {}

  async generate(
    input: Parameters<VideoGenerator["generate"]>[0],
    operationObserved: Parameters<VideoGenerator["generate"]>[1],
  ) {
    const directory = await mkdtemp(join(tmpdir(), `devotional-fake-${randomUUID()}-`));
    const source = join(directory, "source.png");
    const output = join(directory, "base.mp4");
    try {
      await writeFile(source, input.sourceArtwork);
      await execFileAsync(this.ffmpegPath, [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-loop", "1",
        "-i", source,
        "-f", "lavfi",
        "-i", "sine=frequency=196:sample_rate=48000:duration=6",
        "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black",
        "-t", "6",
        "-r", "24",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "96k",
        "-movflags", "+faststart",
        output,
      ], { maxBuffer: 1024 * 1024 });
      await operationObserved(`fake_${randomUUID()}`);
      return { bytes: await readFile(output) };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async resume(operationId: string): Promise<ProviderVideo> {
    throw new Error(`Fake FFmpeg operation ${operationId} is not remotely resumable.`);
  }
}

export class FFmpegMediaFinisher implements MediaFinisher {
  constructor(
    private readonly ffmpegPath = process.env["FFMPEG_PATH"] ?? "ffmpeg",
    private readonly ffprobePath = process.env["FFPROBE_PATH"] ?? "ffprobe",
    private readonly devanagariFontPath = process.env["DEVOTIONAL_FONT_PATH"] ??
      "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
    private readonly latinFontPath = process.env["DEVOTIONAL_LATIN_FONT_PATH"] ??
      "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
  ) {}

  async finish(input: Parameters<MediaFinisher["finish"]>[0]) {
    const directory = await mkdtemp(join(tmpdir(), `devotional-${randomUUID()}-`));
    const source = join(directory, "source.mp4");
    const messageFile = join(directory, "message.txt");
    const output = join(directory, "finished.mp4");
    try {
      const message = wrapMessage(input.personalizedMessage, input.localeIdentifier);
      await Promise.all([
        writeFile(source, input.video.bytes),
        writeFile(messageFile, message, "utf8"),
      ]);
      const fontPath = messageFontPath(
        input.localeIdentifier,
        this.devanagariFontPath,
        this.latinFontPath,
      );
      const filter = buildMessageOverlayFilter(fontPath, messageFile);
      await execFileAsync(this.ffmpegPath, [
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", source,
        "-map", "0:v:0",
        "-map", "0:a:0",
        "-vf", filter,
        "-t", "6",
        "-c:v", "libx264",
        "-profile:v", "high",
        "-level", "4.0",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-c:a", "aac",
        "-b:a", "128k",
        output,
      ], { maxBuffer: 1024 * 1024 });

      const { stdout } = await execFileAsync(this.ffprobePath, [
        "-v", "error",
        "-show_streams",
        "-show_format",
        "-of", "json",
        output,
      ], { maxBuffer: 1024 * 1024 });
      const probe = JSON.parse(stdout) as ProbeResult;
      validateFinishedMediaProbe(probe);
      const bytes = await readFile(output);
      if (bytes.byteLength > 30 * 1024 * 1024) throw new Error("Finished movie exceeds byte limit.");
      return {
        bytes,
        mediaType: "video/mp4" as const,
        byteCount: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        durationSeconds: 6,
        width: 720,
        height: 1280,
        audioPresent: (probe.streams ?? []).some((stream) => stream.codec_type === "audio"),
      };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

export function buildMessageOverlayFilter(fontPath: string, messageFile: string): string {
  const drawText = [
    `drawtext=fontfile='${escapeFilterPath(fontPath)}'`,
    `textfile='${escapeFilterPath(messageFile)}'`,
    "fontcolor=white",
    "fontsize=30",
    "line_spacing=9",
    "box=1",
    "boxcolor=black@0.58",
    "boxborderw=24",
    "x=(w-text_w)/2",
    "y=h-text_h-180",
  ].join(":");
  return [
    "scale=720:1280:force_original_aspect_ratio=decrease",
    "pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black",
    "tpad=stop_mode=clone:stop_duration=6",
    drawText,
  ].join(",");
}

export function wrapMessage(message: string, localeIdentifier: string): string {
  // Preserve the approved copy's internal spaces and explicit line breaks. The
  // only additional newlines below are visual wrapping for the overlay.
  const normalized = message.normalize("NFC").trim();
  const segmenter = new Intl.Segmenter(localeIdentifier, { granularity: "grapheme" });
  const segments = Array.from(segmenter.segment(normalized), ({ segment }) => segment);
  if (segments.length > 240 || normalized.length === 0) {
    throw new Error("Personalized message does not fit the reviewed overlay limits.");
  }
  const words = normalized.split(" ");
  const lineCount = Math.min(5, Math.max(1, Math.ceil(segments.length / 48)));
  const target = Math.ceil(segments.length / lineCount);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const wordSegments = Array.from(segmenter.segment(word), ({ segment }) => segment);
    if (wordSegments.length > target) {
      if (line.length > 0) {
        lines.push(line);
        line = "";
      }
      for (let index = 0; index < wordSegments.length; index += target) {
        const chunk = wordSegments.slice(index, index + target).join("");
        if (index + target < wordSegments.length) lines.push(chunk);
        else line = chunk;
      }
      continue;
    }
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    const candidateLength = Array.from(segmenter.segment(candidate)).length;
    if (line.length === 0 || candidateLength <= target || lines.length >= lineCount - 1) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join("\n");
}

export function messageFontPath(
  localeIdentifier: string,
  devanagariFontPath: string,
  latinFontPath: string,
): string {
  return localeIdentifier === "en-IN" ? latinFontPath : devanagariFontPath;
}

export function validateFinishedMediaProbe(probe: ProbeResult): void {
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  if (video?.codec_name !== "h264" || video.width !== 720 || video.height !== 1280) {
    throw new Error("Finished movie codec or dimensions are invalid.");
  }
  const duration = Number(probe.format?.duration ?? video.duration ?? "nan");
  if (!Number.isFinite(duration) || Math.abs(duration - 6) > 0.2) {
    throw new Error("Finished movie duration is invalid.");
  }
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  if (audio?.codec_name !== "aac") {
    throw new Error("Finished movie must contain a verified AAC audio stream.");
  }
}

function escapeFilterPath(path: string): string {
  return path.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
}
