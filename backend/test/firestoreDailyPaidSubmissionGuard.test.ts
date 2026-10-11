import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { indiaCalendarDay } from "../src/adapters/FirestoreDailyPaidSubmissionGuard.js";

describe("FirestoreDailyPaidSubmissionGuard", () => {
  it("uses an India calendar day across the UTC boundary", () => {
    assert.equal(indiaCalendarDay(new Date("2026-08-24T18:29:59Z")), "2026-08-24");
    assert.equal(indiaCalendarDay(new Date("2026-08-24T18:30:00Z")), "2026-08-25");
  });
});
