import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  StructuredDevotionalLanguageModel,
  type StructuredModelRequest,
  type StructuredOutputModel,
} from "../src/model/StructuredDevotionalLanguageModel.js";
import { testPNG } from "./helpers.js";

describe("StructuredDevotionalLanguageModel interface", () => {
  it("keeps devotional policy and narrative behavior independent of the remote adapter", async () => {
    const policyProvider = new RecordingStructuredAdapter([
      { decision: "allow", coarseReason: "allowed", userMessage: "" },
    ]);
    const narrativeProvider = new RecordingStructuredAdapter([{
      personalizedMessage: "गणपती बाप्पा तुमच्या जीवनात आनंद नांदो.",
      videoPromptEN: "A gentle diya glow moves behind the unchanged murti.",
    }]);
    const model = new StructuredDevotionalLanguageModel({
      policy: policyProvider,
      narrative: narrativeProvider,
    }, {
      policyModel: "provider-a-policy",
      narrativeModel: "provider-b-narrative",
    });

    assert.deepEqual(await model.evaluate({
      stage: "userRequest",
      dedication: "Bless our family",
      localeIdentifier: "mr-IN",
    }), { decision: "allow" });
    const artwork = testPNG();
    const narrative = await model.craft({
      artwork,
      dedication: "Bless our family",
      recipientName: "Asha",
      localeIdentifier: "mr-IN",
    });

    assert.equal(narrative.personalizedMessage.includes("गणपती"), true);
    assert.equal(policyProvider.requests[0]?.model, "provider-a-policy");
    assert.equal(narrativeProvider.requests[0]?.model, "provider-b-narrative");
    assert.deepEqual(narrativeProvider.requests[0]?.parts[0], {
      kind: "image",
      mediaType: "image/png",
      bytes: artwork,
    });
    const requests = [...policyProvider.requests, ...narrativeProvider.requests];
    assert.equal(requests.every((request) => request.temperature === 0), true);
    assert.equal(
      requests.every((request) => request.outputSchema["additionalProperties"] === false),
      true,
    );
    assert.match(policyProvider.requests[0]?.systemInstruction ?? "", /non-Hindu religion/u);
  });

  it("rejects provider output that violates the stable module interface", async () => {
    const provider = new RecordingStructuredAdapter([{ decision: "maybe" }]);
    const model = new StructuredDevotionalLanguageModel({
      policy: provider,
      narrative: provider,
    }, {
      policyModel: "policy",
      narrativeModel: "narrative",
    });

    await assert.rejects(
      model.evaluate({
        stage: "userRequest",
        dedication: "Bless our family",
        localeIdentifier: "en-IN",
      }),
    );
  });
});

class RecordingStructuredAdapter implements StructuredOutputModel {
  readonly requests: StructuredModelRequest[] = [];

  constructor(private readonly responses: unknown[]) {}

  async generate(request: StructuredModelRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.responses.length === 0) throw new Error("No recorded model response.");
    return this.responses.shift();
  }
}
