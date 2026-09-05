import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
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
