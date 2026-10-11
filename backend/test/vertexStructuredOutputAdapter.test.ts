import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { VertexStructuredOutputAdapter } from "../src/adapters/VertexStructuredOutputAdapter.js";

describe("VertexStructuredOutputAdapter", () => {
  afterEach(() => mock.restoreAll());

  it("uses service identity and preserves the structured-output contract", async () => {
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
    const adapter = new VertexStructuredOutputAdapter(
      "project id",
      "global",
      async () => "service-token",
      "https://vertex.invalid/v1",
    );

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
    assert.equal(
      capturedURL,
      "https://vertex.invalid/v1/projects/project%20id/locations/global/"
      + "publishers/google/models/replaceable-model:generateContent",
    );
    const headers = capturedInit?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer service-token");
    const body = JSON.parse(String(capturedInit?.body)) as {
      contents: Array<{ parts: unknown[] }>;
      generationConfig: { responseMimeType: string };
      safetySettings: Array<{ threshold: string }>;
    };
    assert.deepEqual(body.contents[0]?.parts, [
      { inlineData: { mimeType: "image/png", data: "AQID" } },
      { text: "untrusted input" },
    ]);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(
      body.safetySettings.every((setting) => setting.threshold === "BLOCK_LOW_AND_ABOVE"),
      true,
    );
  });

  it("fails closed when Vertex does not return structured text", async () => {
    mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
      candidates: [{ finishReason: "SAFETY" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const adapter = new VertexStructuredOutputAdapter(
      "project",
      "global",
      async () => "service-token",
    );

    await assert.rejects(adapter.generate({
      model: "model",
      systemInstruction: "policy",
      parts: [{ kind: "text", text: "input" }],
      outputSchema: { type: "object" },
      temperature: 0,
      timeoutMilliseconds: 1_000,
    }), /did not contain JSON text/u);
  });
});
