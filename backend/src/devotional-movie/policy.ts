import type { PolicyDecision } from "./contracts.js";

export const SAFE_REJECTION_MESSAGE =
  "Please keep your request devotional, respectful, and non-political.";

export function advancingDecision(decision: PolicyDecision): boolean {
  return decision.decision === "allow";
}
