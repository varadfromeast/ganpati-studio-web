import {
  type CreationAttempt,
  type DevotionalLanguageModel,
  type DirectorOutcome,
  type MediaFinisher,
  type PaidSubmissionLifecycle,
  type PolicyInput,
  type VideoGenerator,
} from "./contracts.js";
import { SAFE_REJECTION_MESSAGE, advancingDecision } from "./policy.js";
import { buildTrustedVideoPrompt } from "./promptProfile.js";

export class DevotionalMovieDirector {
  constructor(
    private readonly languageModel: DevotionalLanguageModel,
    private readonly videoGenerator: VideoGenerator,
    private readonly mediaFinisher: MediaFinisher,
  ) {}

  async create(
    attempt: CreationAttempt,
    lifecycle: PaidSubmissionLifecycle,
  ): Promise<DirectorOutcome> {
    const startedAt = Date.now();
    let stageStartedAt = startedAt;
    const recordStage = (stage: string) => {
      const now = Date.now();
      console.info(JSON.stringify({ event: "devotional_video_timing", stage, durationMs: now - stageStartedAt, elapsedMs: now - startedAt }));
      stageStartedAt = now;
    };
    const firstGate = await this.evaluateGate(this.policyInput(attempt, "userRequest"));
    recordStage("request_policy");
    if (!advancingDecision(firstGate) && firstGate.decision !== "allow") {
      return {
        kind: "rejected",
        userMessage: firstGate.userMessage || SAFE_REJECTION_MESSAGE,
      };
    }

    const generatedNarrative = await this.languageModel.craft({
      artwork: attempt.artwork,
      dedication: attempt.dedication,
      ...(attempt.recipientName === undefined ? {} : { recipientName: attempt.recipientName }),
      ...(attempt.occasion === undefined ? {} : { occasion: attempt.occasion }),
      localeIdentifier: attempt.localeIdentifier,
    });
    recordStage("narrative");
    // The user-approved dedication is the speech and overlay contract. The model may help
    // with reviewed motion direction, but it never rewrites paid display copy.
    const narrative = {
      personalizedMessage: attempt.dedication,
      videoPromptEN: generatedNarrative.videoPromptEN,
    };

    const secondGate = await this.evaluateGate(
      this.policyInput(attempt, "generatedBrief", narrative.personalizedMessage, narrative.videoPromptEN),
    );
    recordStage("brief_policy");
    if (!advancingDecision(secondGate) && secondGate.decision !== "allow") {
      return {
        kind: "rejected",
        userMessage: secondGate.userMessage || SAFE_REJECTION_MESSAGE,
      };
    }

    await lifecycle.beforeSubmission(narrative.personalizedMessage);
    const providerVideo = await this.videoGenerator.generate(
      {
        sourceArtwork: attempt.artwork,
        trustedPrompt: buildTrustedVideoPrompt(narrative),
        durationSeconds: 6,
        width: 720,
        height: 1280,
      },
      lifecycle.operationObserved,
    );
    recordStage("provider_generation");
    await lifecycle.providerOutputObserved(providerVideo);
    recordStage("persist_raw_video");
    const outcome = await this.finish(providerVideo, narrative.personalizedMessage, attempt.localeIdentifier);
    recordStage("finishing");
    return outcome;
  }

  async resume(
    operationId: string,
    personalizedMessage: string,
    localeIdentifier: string,
    lifecycle: PaidSubmissionLifecycle,
  ): Promise<DirectorOutcome> {
    const providerVideo = await this.videoGenerator.resume(operationId);
    await lifecycle.providerOutputObserved(providerVideo);
    return await this.finish(providerVideo, personalizedMessage, localeIdentifier);
  }

  async finish(
    providerVideo: Parameters<MediaFinisher["finish"]>[0]["video"],
    personalizedMessage: string,
    localeIdentifier: string,
  ): Promise<DirectorOutcome> {
    const movie = await this.mediaFinisher.finish({
      video: providerVideo,
      personalizedMessage,
      localeIdentifier,
    });
    return { kind: "ready", message: personalizedMessage, movie };
  }

  private async evaluateGate(input: PolicyInput) {
    try {
      return await this.languageModel.evaluate(input);
    } catch {
      return {
        decision: "review" as const,
        coarseReason: "classifier_unavailable_or_uncertain",
        userMessage: SAFE_REJECTION_MESSAGE,
      };
    }
  }

  private policyInput(
    attempt: CreationAttempt,
    stage: PolicyInput["stage"],
    personalizedMessage?: string,
    videoPromptEN?: string,
  ): PolicyInput {
    return {
      stage,
      dedication: attempt.dedication,
      ...(attempt.recipientName === undefined ? {} : { recipientName: attempt.recipientName }),
      ...(attempt.occasion === undefined ? {} : { occasion: attempt.occasion }),
      localeIdentifier: attempt.localeIdentifier,
      ...(personalizedMessage === undefined ? {} : { personalizedMessage }),
      ...(videoPromptEN === undefined ? {} : { videoPromptEN }),
    };
  }
}
