import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OpenAIEnhancedStillGenerator } from "../src/enhanced-still/EnhancedStillModule.js";
import { sha256 } from "../src/devotional-movie/validation.js";
import { testPNG } from "./helpers.js";

const sourcePNG = testPNG();
const input = {
  sourcePNG,
  sourceCompositionHash: sha256(sourcePNG),
  prompt: "Polish this approved devotional composition while preserving its identity.",
  invariants: ["preserveFaceAndExpression", "preserveTrunkPath"],
};

describe("OpenAIEnhancedStillGenerator interface", () => {
  it("keeps the credential server-side and returns a verified PNG", async () => {
    let authorization = "";
    const generator = new OpenAIEnhancedStillGenerator(
      "server-secret",
      "https://images.invalid/edits",
      async (_url, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(JSON.stringify({
          data: [{ b64_json: Buffer.from(testPNG()).toString("base64") }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
      async () => {},
    );

    const result = await generator.generate(input);

    assert.equal(authorization, "Bearer server-secret");
    assert.deepEqual(Array.from(result), Array.from(testPNG()));
  });

  it("retries bounded transient provider failures", async () => {
    let calls = 0;
    const generator = new OpenAIEnhancedStillGenerator(
      "server-secret",
      "https://images.invalid/edits",
      async () => {
        calls += 1;
        if (calls < 3) return new Response("busy", { status: 503 });
        return new Response(JSON.stringify({
          data: [{ b64_json: Buffer.from(testPNG()).toString("base64") }],
        }), { status: 200 });
      },
      async () => {},
    );

    await generator.generate(input);
    assert.equal(calls, 3);
  });

  it("rejects non-PNG provider output", async () => {
    const generator = new OpenAIEnhancedStillGenerator(
      "server-secret",
      "https://images.invalid/edits",
      async () => new Response(JSON.stringify({
        data: [{ b64_json: Buffer.from("not-png").toString("base64") }],
      }), { status: 200 }),
    );

    await assert.rejects(generator.generate(input), /invalid PNG/u);
  });

  it("rejects a source hash that does not match the PNG bytes before calling the provider", async () => {
    let calls = 0;
    const generator = new OpenAIEnhancedStillGenerator(
      "server-secret",
      "https://images.invalid/edits",
      async () => {
        calls += 1;
        return new Response();
      },
    );

    await assert.rejects(
      generator.generate({ ...input, sourceCompositionHash: "a".repeat(64) }),
      /does not match/u,
    );
    assert.equal(calls, 0);
  });

  it("rejects malformed and excessive-pixel source PNGs before calling the provider", async () => {
    let calls = 0;
    const generator = new OpenAIEnhancedStillGenerator(
      "server-secret",
      "https://images.invalid/edits",
      async () => {
        calls += 1;
        return new Response();
      },
    );
    const malformed = testPNG();
    malformed.set([0x4e, 0x4f, 0x50, 0x45], 12);
    const oversized = testPNG(3_000, 3_000);

    await assert.rejects(generator.generate({
      ...input,
      sourcePNG: malformed,
      sourceCompositionHash: sha256(malformed),
    }), /valid, bounded PNG/u);
    await assert.rejects(generator.generate({
      ...input,
      sourcePNG: oversized,
      sourceCompositionHash: sha256(oversized),
    }), /valid, bounded PNG/u);
    assert.equal(calls, 0);
  });
});
