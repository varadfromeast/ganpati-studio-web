import { createHash } from "node:crypto";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import { DailySpendLimitError } from "../devotional-movie/errors.js";
import type { BillableAttemptGuard } from "../devotional-movie/contracts.js";

const COUNTER_COLLECTION = "devotionalMovieUsage";
const RESERVATION_COLLECTION = "devotionalMoviePaidReservations";
const INDIA_TIME_ZONE = "Asia/Kolkata";

/**
 * Global, transactionally enforced backstop for paid calls. Reservations are intentionally
 * conservative: a failed provider request still consumes the day's slot rather than risking
 * duplicate or excess spend after an ambiguous response.
 */
export class FirestoreDailyPaidSubmissionGuard implements BillableAttemptGuard {
  constructor(
    private readonly maximumPerIndiaDay: number,
    private readonly firestore: Firestore = new Firestore(),
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Number.isSafeInteger(maximumPerIndiaDay) || maximumPerIndiaDay < 1) {
      throw new Error("Daily paid submission maximum must be a positive integer.");
    }
  }

  async reserve(ownerId: string, attemptId: string): Promise<void> {
    const now = this.now();
    const day = indiaCalendarDay(now);
    const reservationId = createHash("sha256")
      .update(`${ownerId}\0${attemptId}`, "utf8")
      .digest("hex");
    const reservation = this.firestore.collection(RESERVATION_COLLECTION).doc(reservationId);
    const counter = this.firestore.collection(COUNTER_COLLECTION).doc(`global_${day}`);

    await this.firestore.runTransaction(async (transaction) => {
      const [reservationSnapshot, counterSnapshot] = await Promise.all([
        transaction.get(reservation),
        transaction.get(counter),
      ]);
      if (reservationSnapshot.exists) return;

      const acceptedCount = counterSnapshot.exists
        ? counterSnapshot.get("acceptedCount")
        : 0;
      if (!Number.isSafeInteger(acceptedCount) || acceptedCount < 0) {
        throw new Error("Paid submission counter is invalid.");
      }
      if (acceptedCount >= this.maximumPerIndiaDay) throw new DailySpendLimitError();

      const updatedAt = Timestamp.fromDate(now);
      const expiresAt = Timestamp.fromDate(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
      transaction.set(counter, {
        day,
        acceptedCount: acceptedCount + 1,
        updatedAt,
        expiresAt,
      });
      transaction.create(reservation, {
        ownerId,
        attemptId,
        day,
        createdAt: updatedAt,
        expiresAt,
      });
    });
  }
}

export function indiaCalendarDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("Could not calculate the India billing day.");
  }
  return `${year}-${month}-${day}`;
}
