import { createHash } from "node:crypto";
import { Firestore, Timestamp } from "@google-cloud/firestore";
import type { BillableAttemptGuard } from "../devotional-movie/contracts.js";
import { DailySpendLimitError } from "../devotional-movie/errors.js";
import { indiaCalendarDay } from "../adapters/FirestoreDailyPaidSubmissionGuard.js";

export const CREDIT_PRODUCTS = new Map([
  ["com.varad.ganpatistudio.credits.3", 3],
  ["com.varad.ganpatistudio.credits.10", 10],
]);

export type VerifiedConsumable = {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  appAccountToken: string;
  purchasedAt: Date;
  revokedAt?: Date;
};

export interface ConsumableTransactionVerifying {
  verify(signedTransaction: string): Promise<VerifiedConsumable>;
}

export type VerifiedAppleEconomyNotification = {
  notificationId: string;
  kind: "refund" | "revoke" | "refund_reversed" | "ignored";
  transaction?: VerifiedConsumable;
};

export interface AppleEconomyNotificationVerifying {
  verifyNotification(signedPayload: string): Promise<VerifiedAppleEconomyNotification>;
}

export type EconomySnapshot = { credits: number; freeCreditsRemaining: number };

export interface GenerationEconomyManaging extends BillableAttemptGuard {
  deliverPurchase(
    ownerId: string,
    appAccountToken: string,
    transaction: VerifiedConsumable,
  ): Promise<EconomySnapshot>;
  snapshot(ownerId: string): Promise<EconomySnapshot>;
  applyAppleNotification(notification: VerifiedAppleEconomyNotification): Promise<void>;
}

export class NoGenerationCreditsError extends Error {}

/**
 * Reserves the user's credit and the global provider-spend slot in one Firestore
 * transaction. Neither scarce resource can be consumed when the other check fails.
 */
export class FirestorePaidGenerationGuard implements BillableAttemptGuard {
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
    const reservationId = stableId(ownerId, attemptId);
    const account = this.firestore.collection("generationCreditAccounts").doc(ownerId);
    const creditReservation = this.firestore.collection("generationCreditReservations")
      .doc(reservationId);
    const dailyReservation = this.firestore.collection("devotionalMoviePaidReservations")
      .doc(reservationId);
    const counter = this.firestore.collection("devotionalMovieUsage").doc(`global_${day}`);

    await this.firestore.runTransaction(async (transaction) => {
      const [accountSnapshot, creditSnapshot, dailySnapshot, counterSnapshot] =
        await Promise.all([
          transaction.get(account),
          transaction.get(creditReservation),
          transaction.get(dailyReservation),
          transaction.get(counter),
        ]);
      if (creditSnapshot.exists && dailySnapshot.exists) return;
      if (creditSnapshot.exists !== dailySnapshot.exists) {
        throw new Error("Paid generation reservation is inconsistent and requires review.");
      }

      const state = decodeAccount(accountSnapshot.data());
      if (state.credits < 1) throw new NoGenerationCreditsError("No generation credits remain.");
      const acceptedCount = counterSnapshot.exists ? counterSnapshot.get("acceptedCount") : 0;
      if (!Number.isSafeInteger(acceptedCount) || acceptedCount < 0) {
        throw new Error("Paid submission counter is invalid.");
      }
      if (acceptedCount >= this.maximumPerIndiaDay) throw new DailySpendLimitError();

      const createdAt = Timestamp.fromDate(now);
      const expiresAt = Timestamp.fromDate(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
      transaction.set(account, {
        credits: state.credits - 1,
        freeCreditsRemaining: Math.max(0, state.freeCreditsRemaining - 1),
        updatedAt: createdAt,
      });
      transaction.create(creditReservation, { ownerId, attemptId, createdAt });
      transaction.create(account.collection("ledger").doc(`debit_${reservationId}`), {
        amount: -1,
        reason: state.freeCreditsRemaining > 0 ? "welcome_generation" : "generation",
        attemptId,
        createdAt,
      });
      transaction.set(counter, {
        day,
        acceptedCount: acceptedCount + 1,
        updatedAt: createdAt,
        expiresAt,
      });
      transaction.create(dailyReservation, {
        ownerId,
        attemptId,
        day,
        createdAt,
        expiresAt,
      });
    });
  }
}

export class InMemoryGenerationEconomy implements GenerationEconomyManaging {
  private readonly accounts = new Map<string, EconomySnapshot>();
  private readonly reservations = new Set<string>();
  private readonly purchases = new Map<string, { ownerId: string; credits: number; refunded: boolean }>();
  private readonly notifications = new Set<string>();
  private readonly ownersByAppAccountToken = new Map<string, string>();
  private readonly refundedTransactions = new Map<string, boolean>();

  async reserve(ownerId: string, attemptId: string): Promise<void> {
    const key = stableId(ownerId, attemptId);
    if (this.reservations.has(key)) return;
    const state = await this.snapshot(ownerId);
    if (state.credits < 1) throw new NoGenerationCreditsError("No generation credits remain.");
    this.reservations.add(key);
    this.accounts.set(ownerId, {
      credits: state.credits - 1,
      freeCreditsRemaining: Math.max(0, state.freeCreditsRemaining - 1),
    });
  }

  async deliverPurchase(
    ownerId: string,
    appAccountToken: string,
    purchase: VerifiedConsumable,
  ): Promise<EconomySnapshot> {
    if (purchase.appAccountToken.toLowerCase() !== appAccountToken.toLowerCase() ||
        purchase.revokedAt !== undefined) throw new Error("Purchase is not deliverable.");
    const granted = CREDIT_PRODUCTS.get(purchase.productId);
    if (granted === undefined) throw new Error("Unknown generation credit product.");
    const normalizedToken = appAccountToken.toLowerCase();
    const boundOwner = this.ownersByAppAccountToken.get(normalizedToken);
    if (boundOwner !== undefined && boundOwner !== ownerId) {
      throw new Error("App account token belongs to another account.");
    }
    const state = await this.snapshot(ownerId);
    const existing = this.purchases.get(purchase.transactionId);
    if (existing !== undefined) {
      if (existing.ownerId !== ownerId) throw new Error("Transaction belongs to another account.");
      return state;
    }
    if (this.refundedTransactions.get(purchase.transactionId) === true) {
      throw new Error("Refunded transaction cannot grant credits.");
    }
    this.ownersByAppAccountToken.set(normalizedToken, ownerId);
    this.purchases.set(purchase.transactionId, { ownerId, credits: granted, refunded: false });
    const updated = { ...state, credits: state.credits + granted };
    this.accounts.set(ownerId, updated);
    return updated;
  }

  async snapshot(ownerId: string): Promise<EconomySnapshot> {
    return this.accounts.get(ownerId) ?? { credits: 2, freeCreditsRemaining: 2 };
  }

  async applyAppleNotification(notification: VerifiedAppleEconomyNotification): Promise<void> {
    if (this.notifications.has(notification.notificationId) || notification.kind === "ignored") return;
    this.notifications.add(notification.notificationId);
    if (notification.transaction !== undefined) {
      this.refundedTransactions.set(
        notification.transaction.transactionId,
        notification.kind === "refund" || notification.kind === "revoke",
      );
    }
    const purchase = notification.transaction === undefined
      ? undefined
      : this.purchases.get(notification.transaction.transactionId);
    if (purchase === undefined) return;
    const shouldRefund = notification.kind === "refund" || notification.kind === "revoke";
    if (purchase.refunded === shouldRefund) return;
    const state = await this.snapshot(purchase.ownerId);
    this.accounts.set(purchase.ownerId, {
      ...state,
      credits: shouldRefund
        ? Math.max(0, state.credits - purchase.credits)
        : state.credits + purchase.credits,
    });
    purchase.refunded = shouldRefund;
  }
}

/** Append-only credit ledger with atomically maintained balance and idempotent reservations. */
export class FirestoreGenerationEconomy implements GenerationEconomyManaging {
  constructor(
    private readonly firestore: Firestore = new Firestore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reserve(ownerId: string, attemptId: string): Promise<void> {
    const account = this.account(ownerId);
    const reservation = this.firestore.collection("generationCreditReservations")
      .doc(stableId(ownerId, attemptId));
    await this.firestore.runTransaction(async (transaction) => {
      const [accountSnapshot, reservationSnapshot] = await Promise.all([
        transaction.get(account),
        transaction.get(reservation),
      ]);
      if (reservationSnapshot.exists) return;
      const state = decodeAccount(accountSnapshot.data());
      if (state.credits < 1) throw new NoGenerationCreditsError("No generation credits remain.");
      const createdAt = Timestamp.fromDate(this.now());
      transaction.set(account, {
        credits: state.credits - 1,
        freeCreditsRemaining: Math.max(0, state.freeCreditsRemaining - 1),
        updatedAt: createdAt,
      });
      transaction.create(reservation, { ownerId, attemptId, createdAt });
      transaction.create(account.collection("ledger").doc(`debit_${stableId(ownerId, attemptId)}`), {
        amount: -1,
        reason: state.freeCreditsRemaining > 0 ? "welcome_generation" : "generation",
        attemptId,
        createdAt,
      });
    });
  }

  async deliverPurchase(
    ownerId: string,
    appAccountToken: string,
    purchase: VerifiedConsumable,
  ): Promise<EconomySnapshot> {
    if (purchase.appAccountToken.toLowerCase() !== appAccountToken.toLowerCase()) {
      throw new Error("App account token does not match the verified transaction.");
    }
    if (purchase.revokedAt !== undefined) throw new Error("Revoked transaction cannot grant credits.");
    const credits = CREDIT_PRODUCTS.get(purchase.productId);
    if (credits === undefined) throw new Error("Unknown generation credit product.");
    const account = this.account(ownerId);
    const receipt = this.firestore.collection("appleTransactions").doc(purchase.transactionId);
    const binding = this.firestore.collection("generationAppAccountTokens")
      .doc(stableId(appAccountToken.toLowerCase()));
    const transactionState = this.firestore.collection("appleTransactionStates")
      .doc(purchase.transactionId);
    return await this.firestore.runTransaction(async (transaction) => {
      const [accountSnapshot, receiptSnapshot, bindingSnapshot, stateSnapshot] = await Promise.all([
        transaction.get(account),
        transaction.get(receipt),
        transaction.get(binding),
        transaction.get(transactionState),
      ]);
      const state = decodeAccount(accountSnapshot.data());
      if (bindingSnapshot.exists && bindingSnapshot.get("ownerId") !== ownerId) {
        throw new Error("App account token belongs to another account.");
      }
      if (receiptSnapshot.exists) {
        if (receiptSnapshot.get("ownerId") !== ownerId) {
          throw new Error("Transaction belongs to another account.");
        }
        return state;
      }
      if (stateSnapshot.get("refunded") === true) {
        throw new Error("Refunded transaction cannot grant credits.");
      }
      const createdAt = Timestamp.fromDate(this.now());
      if (!bindingSnapshot.exists) transaction.create(binding, { ownerId, createdAt });
      transaction.create(receipt, {
        ownerId,
        ...purchase,
        purchasedAt: Timestamp.fromDate(purchase.purchasedAt),
        createdAt,
      });
      transaction.set(account, {
        credits: state.credits + credits,
        freeCreditsRemaining: state.freeCreditsRemaining,
        updatedAt: createdAt,
      });
      transaction.create(account.collection("ledger").doc(`grant_${purchase.transactionId}`), {
        amount: credits,
        reason: "apple_consumable_purchase",
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        createdAt,
      });
      return { credits: state.credits + credits, freeCreditsRemaining: state.freeCreditsRemaining };
    });
  }

  async snapshot(ownerId: string): Promise<EconomySnapshot> {
    return decodeAccount((await this.account(ownerId).get()).data());
  }

  async applyAppleNotification(notification: VerifiedAppleEconomyNotification): Promise<void> {
    if (notification.kind === "ignored" || notification.transaction === undefined) return;
    const purchase = notification.transaction;
    const event = this.firestore.collection("appleEconomyNotifications").doc(notification.notificationId);
    const receipt = this.firestore.collection("appleTransactions").doc(purchase.transactionId);
    const transactionState = this.firestore.collection("appleTransactionStates")
      .doc(purchase.transactionId);
    await this.firestore.runTransaction(async (transaction) => {
      const [eventSnapshot, receiptSnapshot] = await Promise.all([
        transaction.get(event),
        transaction.get(receipt),
      ]);
      if (eventSnapshot.exists) return;
      const shouldRefund = notification.kind === "refund" || notification.kind === "revoke";
      const createdAt = Timestamp.fromDate(this.now());
      const receiptData = receiptSnapshot.data();
      const ownerId = receiptData?.["ownerId"];
      const productId = receiptData?.["productId"];
      if (typeof ownerId !== "string" || typeof productId !== "string") {
        transaction.set(transactionState, {
          transactionId: purchase.transactionId,
          refunded: shouldRefund,
          updatedAt: createdAt,
        });
        transaction.create(event, { kind: notification.kind, unmatched: true, createdAt });
        return;
      }
      const granted = CREDIT_PRODUCTS.get(productId);
      if (granted === undefined) throw new Error("Refund references an unknown credit product.");
      const account = this.account(ownerId);
      const accountSnapshot = await transaction.get(account);
      const state = decodeAccount(accountSnapshot.data());
      const wasRefunded = receiptData?.["refunded"] === true;
      transaction.set(transactionState, {
        transactionId: purchase.transactionId,
        refunded: shouldRefund,
        updatedAt: createdAt,
      });
      transaction.create(event, { ownerId, transactionId: purchase.transactionId, kind: notification.kind, createdAt });
      if (wasRefunded === shouldRefund) return;
      const availableDelta = shouldRefund ? -Math.min(state.credits, granted) : granted;
      const unrecoveredCredits = shouldRefund ? Math.max(0, granted - state.credits) : 0;
      transaction.update(receipt, { refunded: shouldRefund, refundedAt: shouldRefund ? createdAt : null });
      transaction.set(account, {
        credits: state.credits + availableDelta,
        freeCreditsRemaining: state.freeCreditsRemaining,
        updatedAt: createdAt,
      });
      transaction.create(account.collection("ledger").doc(`apple_event_${notification.notificationId}`), {
        amount: availableDelta,
        unrecoveredCredits,
        reason: shouldRefund ? "apple_refund" : "apple_refund_reversed",
        transactionId: purchase.transactionId,
        createdAt,
      });
    });
  }

  private account(ownerId: string) {
    return this.firestore.collection("generationCreditAccounts").doc(ownerId);
  }
}

function decodeAccount(data: FirebaseFirestore.DocumentData | undefined): EconomySnapshot {
  if (data === undefined) return { credits: 2, freeCreditsRemaining: 2 };
  const credits = data["credits"];
  const free = data["freeCreditsRemaining"];
  if (!Number.isSafeInteger(credits) || credits < 0 || !Number.isSafeInteger(free) || free < 0) {
    throw new Error("Generation credit account is invalid.");
  }
  return { credits, freeCreditsRemaining: free };
}

function stableId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\0"), "utf8").digest("hex");
}
