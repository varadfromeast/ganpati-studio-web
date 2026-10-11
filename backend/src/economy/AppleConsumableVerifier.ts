import { readFile } from "node:fs/promises";
import {
  Environment,
  SignedDataVerifier,
} from "@apple/app-store-server-library";
import type {
  ConsumableTransactionVerifying,
  AppleEconomyNotificationVerifying,
  VerifiedAppleEconomyNotification,
  VerifiedConsumable,
} from "./GenerationEconomy.js";

export class AppleConsumableVerifier implements ConsumableTransactionVerifying, AppleEconomyNotificationVerifying {
  constructor(private readonly verifier: SignedDataVerifier) {}

  static async configured(input: {
    rootCertificatePaths: string[];
    environment: "Sandbox" | "Production";
    bundleId: string;
    appAppleId?: number;
  }): Promise<AppleConsumableVerifier> {
    const roots = await Promise.all(input.rootCertificatePaths.map(async (path) => await readFile(path)));
    return new AppleConsumableVerifier(new SignedDataVerifier(
      roots,
      true,
      input.environment === "Production" ? Environment.PRODUCTION : Environment.SANDBOX,
      input.bundleId,
      input.appAppleId,
    ));
  }

  async verify(signedTransaction: string): Promise<VerifiedConsumable> {
    const value = await this.verifier.verifyAndDecodeTransaction(signedTransaction);
    if (value.transactionId === undefined || value.originalTransactionId === undefined ||
        value.productId === undefined || value.appAccountToken === undefined ||
        value.purchaseDate === undefined) {
      throw new Error("Verified Apple transaction is missing required fields.");
    }
    return {
      transactionId: value.transactionId,
      originalTransactionId: value.originalTransactionId,
      productId: value.productId,
      appAccountToken: value.appAccountToken,
      purchasedAt: new Date(value.purchaseDate),
      ...(value.revocationDate === undefined ? {} : { revokedAt: new Date(value.revocationDate) }),
    };
  }

  async verifyNotification(signedPayload: string): Promise<VerifiedAppleEconomyNotification> {
    const value = await this.verifier.verifyAndDecodeNotification(signedPayload);
    if (value.notificationUUID === undefined) throw new Error("Apple notification has no identifier.");
    const kinds = new Map<string, VerifiedAppleEconomyNotification["kind"]>([
      ["REFUND", "refund"],
      ["REVOKE", "revoke"],
      ["REFUND_REVERSED", "refund_reversed"],
    ]);
    const kind = kinds.get(String(value.notificationType)) ?? "ignored";
    const signedTransaction = value.data?.signedTransactionInfo;
    return {
      notificationId: value.notificationUUID,
      kind,
      ...(signedTransaction === undefined ? {} : { transaction: await this.verify(signedTransaction) }),
    };
  }
}
