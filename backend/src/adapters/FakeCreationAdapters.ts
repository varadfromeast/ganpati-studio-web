import { createHash } from "node:crypto";
import type {
  DevotionalLanguageModel,
  MediaFinisher,
  PolicyInput,
  VideoGenerator,
} from "../devotional-movie/contracts.js";
import type { MobileRequestVerifier, TaskRequestVerifier } from "../http/authenticate.js";
import { HttpError } from "../devotional-movie/errors.js";

export class ProvisionalDevotionalLanguageModel implements DevotionalLanguageModel {
  async evaluate(input: PolicyInput) {
    const text = [
      input.dedication,
      input.recipientName,
      input.occasion,
      input.personalizedMessage,
      input.videoPromptEN,
    ].filter(Boolean).join(" ").toLocaleLowerCase("en-IN");
    const blocked = /\b(election|vote|party|politician|campaign|kill|hate|inferior|destroy)\b/.test(text);
    return blocked
      ? {
          decision: "block" as const,
          coarseReason: "provisional_rule_block",
          userMessage: "Please keep your request devotional, respectful, and non-political.",
        }
      : { decision: "allow" as const };
  }
  async craft(input: Parameters<DevotionalLanguageModel["craft"]>[0]) {
    const name = input.recipientName?.trim();
    if (input.localeIdentifier === "mr-IN") {
      return {
        personalizedMessage: name
          ? `गणपती बाप्पा ${name} यांच्या जीवनात आनंद आणि शांती नांदो.`
          : "गणपती बाप्पा तुमच्या जीवनात आनंद आणि शांती नांदो.",
        videoPromptEN: "A gentle diya glow and a few marigold petals drift slowly in the background.",
      };
    }
    if (input.localeIdentifier === "hi-IN") {
      return {
        personalizedMessage: name
          ? `गणपति बप्पा ${name} के जीवन में आनंद और शांति लाएँ।`
          : "गणपति बप्पा आपके जीवन में आनंद और शांति लाएँ।",
        videoPromptEN: "A gentle diya glow and a few marigold petals drift slowly in the background.",
      };
    }
    return {
      personalizedMessage: name
        ? `May Ganpati Bappa bring joy and peace to ${name}.`
        : "May Ganpati Bappa bring joy and peace to your life.",
      videoPromptEN: "A gentle diya glow and a few marigold petals drift slowly in the background.",
    };
  }
}

export class FakeVideoGenerator implements VideoGenerator {
  async generate(
    input: Parameters<VideoGenerator["generate"]>[0],
    operationObserved: Parameters<VideoGenerator["generate"]>[1],
  ) {
    const operationId = `fake_${crypto.randomUUID()}`;
    await operationObserved(operationId);
    return {
      bytes: new TextEncoder().encode(`fake-mp4:${createHash("sha256").update(input.sourceArtwork).digest("hex")}`),
    };
  }

  async resume(operationId: string) {
    return {
      bytes: new TextEncoder().encode(`fake-mp4-resumed:${operationId}`),
    };
  }
}

export class FakeMediaFinisher implements MediaFinisher {
  async finish(input: Parameters<MediaFinisher["finish"]>[0]) {
    const bytes = input.video.bytes;
    return {
      bytes,
      mediaType: "video/mp4" as const,
      byteCount: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      durationSeconds: 6,
      width: 720,
      height: 1280,
    };
  }
}

export class DevelopmentMobileVerifier implements MobileRequestVerifier {
  async verify(idToken: string, appCheckToken: string) {
    if (process.env["ALLOW_INSECURE_DEVELOPMENT_AUTH"] !== "true") {
      throw new HttpError(401, "development_auth_disabled", "Development authentication is disabled.");
    }
    if (appCheckToken !== "development-app-check" || !idToken.startsWith("development-user:")) {
      throw new HttpError(401, "invalid_development_identity", "Development identity is invalid.");
    }
    return { ownerId: idToken.slice("development-user:".length) };
  }
}

export class DevelopmentTaskVerifier implements TaskRequestVerifier {
  async verify(authorization: string) {
    if (
      process.env["ALLOW_INSECURE_DEVELOPMENT_AUTH"] !== "true" ||
      authorization !== "Bearer development-task"
    ) {
      throw new HttpError(401, "invalid_task_identity", "Task identity is invalid.");
    }
  }
}
