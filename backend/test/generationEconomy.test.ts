import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InMemoryGenerationEconomy,
  NoGenerationCreditsError,
} from "../src/economy/GenerationEconomy.js";

describe("Generation Economy interface", () => {
  it("grants two lifetime welcome uses and reserves each attempt idempotently", async () => {
    const economy = new InMemoryGenerationEconomy();
    await economy.reserve("owner", "attempt-1");
    await economy.reserve("owner", "attempt-1");
    await economy.reserve("owner", "attempt-2");
    assert.deepEqual(await economy.snapshot("owner"), { credits: 0, freeCreditsRemaining: 0 });
    await assert.rejects(economy.reserve("owner", "attempt-3"), NoGenerationCreditsError);
  });

  it("delivers a verified consumable transaction exactly once", async () => {
    const economy = new InMemoryGenerationEconomy();
    const purchase = {
      transactionId: "transaction-1",
      originalTransactionId: "transaction-1",
      productId: "com.varad.ganpatistudio.credits.3",
      appAccountToken: "1a0e5995-611c-48ed-94ee-e08fc1dfb10b",
      purchasedAt: new Date(),
    };
    await economy.deliverPurchase("owner", purchase.appAccountToken, purchase);
    await economy.deliverPurchase("owner", purchase.appAccountToken, purchase);
    assert.deepEqual(await economy.snapshot("owner"), { credits: 5, freeCreditsRemaining: 2 });
  });

  it("does not allow a verified transaction or app-account token to move between owners", async () => {
    const economy = new InMemoryGenerationEconomy();
    const purchase = {
      transactionId: "transaction-owned",
      originalTransactionId: "transaction-owned",
      productId: "com.varad.ganpatistudio.credits.3",
      appAccountToken: "1a0e5995-611c-48ed-94ee-e08fc1dfb10b",
      purchasedAt: new Date(),
    };
    await economy.deliverPurchase("owner-a", purchase.appAccountToken, purchase);

    await assert.rejects(
      economy.deliverPurchase("owner-b", purchase.appAccountToken, purchase),
      /another account/u,
    );
    await assert.rejects(
      economy.deliverPurchase("owner-b", purchase.appAccountToken, {
        ...purchase,
        transactionId: "transaction-2",
      }),
      /another account/u,
    );
  });

  it("honors a refund notification that arrives before purchase delivery", async () => {
    const economy = new InMemoryGenerationEconomy();
    const purchase = {
      transactionId: "transaction-refunded-first",
      originalTransactionId: "transaction-refunded-first",
      productId: "com.varad.ganpatistudio.credits.3",
      appAccountToken: "1a0e5995-611c-48ed-94ee-e08fc1dfb10b",
      purchasedAt: new Date(),
    };
    await economy.applyAppleNotification({
      notificationId: "refund-before-delivery",
      kind: "refund",
      transaction: purchase,
    });

    await assert.rejects(
      economy.deliverPurchase("owner", purchase.appAccountToken, purchase),
      /Refunded transaction/u,
    );
    assert.deepEqual(await economy.snapshot("owner"), { credits: 2, freeCreditsRemaining: 2 });
  });

  it("applies refund and refund reversal notifications idempotently", async () => {
    const economy = new InMemoryGenerationEconomy();
    const purchase = {
      transactionId: "transaction-refund",
      originalTransactionId: "transaction-refund",
      productId: "com.varad.ganpatistudio.credits.3",
      appAccountToken: "1a0e5995-611c-48ed-94ee-e08fc1dfb10b",
      purchasedAt: new Date(),
    };
    await economy.deliverPurchase("owner", purchase.appAccountToken, purchase);
    await economy.applyAppleNotification({ notificationId: "refund-1", kind: "refund", transaction: purchase });
    await economy.applyAppleNotification({ notificationId: "refund-1", kind: "refund", transaction: purchase });
    assert.deepEqual(await economy.snapshot("owner"), { credits: 2, freeCreditsRemaining: 2 });
    await economy.applyAppleNotification({ notificationId: "reversal-1", kind: "refund_reversed", transaction: purchase });
    assert.deepEqual(await economy.snapshot("owner"), { credits: 5, freeCreditsRemaining: 2 });
  });
});
