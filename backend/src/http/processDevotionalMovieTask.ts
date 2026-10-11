import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { DevotionalMovieJobs } from "../devotional-movie/contracts.js";
import { HttpError } from "../devotional-movie/errors.js";

const BodySchema = z.object({ ownerId: z.string().min(1).max(128) }).strict();

export function processDevotionalMovieTask(jobs: DevotionalMovieJobs) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      const parsed = BodySchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_task", "Task body is invalid.");
      const rawAttemptId = request.params["attemptId"];
      const attemptId = typeof rawAttemptId === "string" ? rawAttemptId : "";
      await jobs.process(parsed.data.ownerId, attemptId);
      response.status(204).end();
    } catch (error) {
      next(error);
    }
  };
}
