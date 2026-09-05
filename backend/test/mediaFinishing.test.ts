import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  FFmpegMediaFinisher,
  buildMessageOverlayFilter,
  messageFontPath,
  wrapMessage,
  validateFinishedMediaProbe,
} from "../src/devotional-movie/mediaFinishing.js";

describe("message overlay layout", () => {
  it("keeps drawtext options inside one FFmpeg 5-compatible filter", () => {
    const filter = buildMessageOverlayFilter("/fonts/devanagari.ttf", "/tmp/message.txt");

    assert.match(filter, /,drawtext=/);
    assert.match(filter, /:fontcolor=white:/);
    assert.doesNotMatch(filter, /,fontcolor=/);
    assert.doesNotMatch(filter, /text_align=/);
  });

  it("lays out approved English copy in no more than two lines", () => {
    const result = wrapMessage("May Ganpati Bappa bring joy and peace to Asha.", "en-IN");
    assert.ok(result.split("\n").length <= 2);
  });

  it("uses a Latin-capable font for the English greeting", () => {
    assert.equal(
      messageFontPath("en-IN", "/fonts/devanagari.ttf", "/fonts/latin.ttf"),
      "/fonts/latin.ttf",
    );
    assert.equal(
      messageFontPath("mr-IN", "/fonts/devanagari.ttf", "/fonts/latin.ttf"),
      "/fonts/devanagari.ttf",
    );
  });

  it("lays out approved Hindi copy in no more than two lines", () => {
    const result = wrapMessage("गणपति बप्पा आशा के जीवन में आनंद और शांति लाएँ।", "hi-IN");
    assert.ok(result.split("\n").length <= 2);
  });

  it("lays out approved Marathi copy in no more than two lines", () => {
    const result = wrapMessage("गणपती बाप्पा आशाच्या जीवनात आनंद आणि शांती नांदो.", "mr-IN");
    assert.ok(result.split("\n").length <= 2);
  });

  it("preserves an approved message up to the 240-character request limit", () => {
    const approved = "May Bappa bring joy, courage, patience, kindness, good health, shared laughter, gentle beginnings, and lasting peace to every person in our family as we celebrate together with gratitude and love.";
    const result = wrapMessage(approved, "en-IN");

    assert.equal(result.replaceAll("\n", " "), approved);
    assert.ok(result.split("\n").length <= 5);

    const unbroken = "a".repeat(240);
    const wrappedUnbroken = wrapMessage(unbroken, "en-IN");
    assert.equal(wrappedUnbroken.replaceAll("\n", ""), unbroken);
    assert.equal(wrappedUnbroken.split("\n").length, 5);
  });

  it("preserves approved internal whitespace and canonical Devanagari copy", () => {
    const approved = "जय  गणेश\nशुभारंभ";
    const result = wrapMessage(approved, "hi-IN");

    assert.equal(result, approved);
    assert.equal(wrapMessage("गणे\u0301श", "hi-IN"), "गणे\u0301श".normalize("NFC"));
  });

  it("fails instead of silently overflowing", () => {
    assert.throws(
      () => wrapMessage("a".repeat(241), "en-IN"),
      /overlay limits/,
    );
  });

  it("rejects silent production output", () => {
    assert.throws(
      () => validateFinishedMediaProbe({
        streams: [{ codec_type: "video", codec_name: "h264", width: 720, height: 1280 }],
        format: { duration: "6.0" },
      }),
      /AAC audio/u,
    );
  });

  it("accepts the production H.264 and AAC contract", () => {
    assert.doesNotThrow(() => validateFinishedMediaProbe({
      streams: [
        { codec_type: "video", codec_name: "h264", width: 720, height: 1280 },
        { codec_type: "audio", codec_name: "aac" },
      ],
      format: { duration: "6.0" },
    }));
  });
});

// Exercise the actual finisher invocation without requiring a platform-specific drawtext build.
it("finishes using provider audio without replacing or fading the soundtrack", async () => {
  const directory = await mkdtemp(join(tmpdir(), "finisher-audio-test-"));
  try {
    const encoder = join(directory, "encoder");
    const probe = join(directory, "probe");
    const argumentsFile = join(directory, "arguments.json");
    await writeFile(encoder, `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argumentsFile)}, JSON.stringify(args));
fs.writeFileSync(args.at(-1), 'encoded-video');
`);
    await writeFile(probe, `#!${process.execPath}
console.log(JSON.stringify({streams:[{codec_type:'video',codec_name:'h264',width:720,height:1280},{codec_type:'audio',codec_name:'aac'}],format:{duration:'6.0'}}));
`);
    await chmod(encoder, 0o755);
    await chmod(probe, 0o755);
    await new FFmpegMediaFinisher(encoder, probe).finish({
      video: { bytes: new Uint8Array([1]) }, personalizedMessage: "Happy Ganesh Chaturthi!", localeIdentifier: "en-IN",
    });
    const args = JSON.parse(await readFile(argumentsFile, "utf8")) as string[];
    assert.ok(args.some((value, index) => value === "-map" && args[index + 1] === "0:a:0"));
    assert.ok(!args.includes("lavfi"), "must not replace speech with synthetic audio");
    assert.ok(!args.includes("-af"), "must not fade out the last spoken words");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
