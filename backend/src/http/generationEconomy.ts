import type { NextFunction, Response } from "express";
import { z } from "zod";
import type {
  ConsumableTransactionVerifying,
  AppleEconomyNotificationVerifying,
  GenerationEconomyManaging,
} from "../economy/GenerationEconomy.js";
import { HttpError } from "../devotional-movie/errors.js";
import type { AuthenticatedRequest } from "./authenticate.js";

const DeliverySchema = z.object({
  signedTransaction: z.string().min(40).max(64_000),
  appAccountToken: z.string().uuid(),
}).strict();
const NotificationSchema = z.object({ signedPayload: z.string().min(40).max(128_000) }).strict();

export function getGenerationEconomy(economy: GenerationEconomyManaging) {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    try {
      const ownerId = request.principal?.ownerId;
      if (ownerId === undefined) throw new HttpError(401, "unauthorized", "Authentication is required.");
      response.json(await economy.snapshot(ownerId));
    } catch (error) { next(error); }
  };
}

export function handleAppleEconomyNotification(
  economy: GenerationEconomyManaging,
  verifier: AppleEconomyNotificationVerifying,
) {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    try {
      const body = NotificationSchema.parse(request.body);
      await economy.applyAppleNotification(await verifier.verifyNotification(body.signedPayload));
      response.sendStatus(200);
    } catch (error) {
      if (error instanceof z.ZodError) return next(new HttpError(400, "invalid_notification", "Notification is invalid."));
      next(error);
    }
  };
}

export function deliverGenerationPurchase(
  economy: GenerationEconomyManaging,
  verifier: ConsumableTransactionVerifying,
) {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    try {
      const body = DeliverySchema.parse(request.body);
      const verified = await verifier.verify(body.signedTransaction);
      const ownerId = request.principal?.ownerId;
      if (ownerId === undefined) throw new HttpError(401, "unauthorized", "Authentication is required.");
      response.json(await economy.deliverPurchase(
        ownerId,
        body.appAccountToken,
        verified,
      ));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return next(new HttpError(400, "invalid_purchase", "Purchase delivery is invalid."));
      }
      next(error);
    }
  };
}
