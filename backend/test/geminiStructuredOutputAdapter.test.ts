import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { GeminiStructuredOutputAdapter } from "../src/adapters/GeminiStructuredOutputAdapter.js";

describe("GeminiStructuredOutputAdapter", () => {
  afterEach(() => mock.restoreAll());

  it("translates the provider-neutral structured request at one remote seam", async () => {
    let capturedURL = "";
    let capturedInit: RequestInit | undefined;
    mock.method(globalThis, "fetch", async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedURL = String(input);
      capturedInit = init;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "{\"decision\":\"allow\"}" }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const adapter = new GeminiStructuredOutputAdapter("test-key", "https://gemini.invalid/v1beta");

    const result = await adapter.generate({
      model: "replaceable-model",
      systemInstruction: "fixed policy",
      parts: [
        { kind: "image", mediaType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
        { kind: "text", text: "untrusted input" },
      ],
      outputSchema: { type: "object" },
      temperature: 0,
      timeoutMilliseconds: 1_000,
    });

    assert.deepEqual(result, { decision: "allow" });
    assert.equal(capturedURL, "https://gemini.invalid/v1beta/models/replaceable-model:generateContent");
    const body = JSON.parse(String(capturedInit?.body)) as {
      contents: Array<{ parts: unknown[] }>;
      generationConfig: { responseMimeType: string };
    };
    assert.deepEqual(body.contents[0]?.parts, [
      { inlineData: { mimeType: "image/png", data: "AQID" } },
      { text: "untrusted input" },
    ]);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
  });
});
