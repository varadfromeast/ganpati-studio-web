import type { DevotionalNarrative } from "./contracts.js";

const TRUSTED_PREFIX = `Create a respectful six-second portrait devotional animation from the supplied Ganesh artwork.
Preserve the murti's identity, face, trunk, hands, pose, clothing, ornaments, background composition, and camera framing.
Use only subtle ambient motion. Do not generate speech, chanting, lyrics, or mouth movement; the app adds its own gentle ambience and message in finishing.
Do not add text, logos, political symbols, extra limbs, or a different deity.`;

export function buildTrustedVideoPrompt(narrative: DevotionalNarrative): string {
  return `${TRUSTED_PREFIX}\nReviewed motion direction: ${narrative.videoPromptEN.trim()}`;
}
