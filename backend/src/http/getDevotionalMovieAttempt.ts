import type { NextFunction, Response } from "express";
import type { DevotionalMovieJobs } from "../devotional-movie/contracts.js";
import { HttpError } from "../devotional-movie/errors.js";
import type { AuthenticatedRequest } from "./authenticate.js";

export function getDevotionalMovieAttempt(jobs: DevotionalMovieJobs) {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    try {
      const ownerId = request.principal?.ownerId;
      if (ownerId === undefined) throw new HttpError(401, "unauthorized", "Authentication is required.");
      const rawAttemptId = request.params["attemptId"];
      const attemptId = typeof rawAttemptId === "string" ? rawAttemptId : "";
      const snapshot = await jobs.findOwned(ownerId, attemptId);
      if (snapshot === null) {
        throw new HttpError(404, "attempt_not_found", "Attempt was not found.");
      }
      const status = snapshot.kind === "processing" ? 202 : 200;
      if (snapshot.kind === "processing") response.set("Retry-After", String(snapshot.retryAfterSeconds));
      response.status(status).json(snapshot);
    } catch (error) {
      next(error);
    }
  };
}
