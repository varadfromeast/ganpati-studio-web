import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../devotional-movie/errors.js";

export type VerifiedMobileIdentity = { ownerId: string };

export interface MobileRequestVerifier {
  verify(idToken: string, appCheckToken: string): Promise<VerifiedMobileIdentity>;
}

export interface TaskRequestVerifier {
  verify(authorization: string): Promise<void>;
}

export type AuthenticatedRequest = Request & { principal?: VerifiedMobileIdentity };

export function authenticateMobile(verifier: MobileRequestVerifier) {
  return async (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    try {
      const authorization = request.header("authorization") ?? "";
      const match = /^Bearer (.+)$/i.exec(authorization);
      if (match?.[1] === undefined) {
        throw new HttpError(401, "invalid_identity_token", "Authentication is required.");
      }
      const appCheck = request.header("x-firebase-appcheck");
      if (appCheck === undefined || appCheck.length === 0) {
        throw new HttpError(403, "invalid_app_check_token", "App attestation is required.");
      }
      request.principal = await verifier.verify(match[1], appCheck);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function authenticateTask(verifier: TaskRequestVerifier) {
  return async (request: Request, _response: Response, next: NextFunction) => {
    try {
      await verifier.verify(request.header("authorization") ?? "");
      next();
    } catch (error) {
      next(error);
    }
  };
}
