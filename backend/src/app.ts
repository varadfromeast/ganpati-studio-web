import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { DevotionalMovieJobs } from "./devotional-movie/contracts.js";
import { HttpError } from "./devotional-movie/errors.js";
import {
  authenticateMobile,
  authenticateTask,
  type MobileRequestVerifier,
  type TaskRequestVerifier,
} from "./http/authenticate.js";
import { createDevotionalMovie } from "./http/createDevotionalMovie.js";
import { getDevotionalMovieAttempt } from "./http/getDevotionalMovieAttempt.js";
import { processDevotionalMovieTask } from "./http/processDevotionalMovieTask.js";
import { createEnhancedStill } from "./http/createEnhancedStill.js";
import type { EnhancedStillGenerating } from "./enhanced-still/EnhancedStillModule.js";
import type {
  ConsumableTransactionVerifying,
  AppleEconomyNotificationVerifying,
  GenerationEconomyManaging,
} from "./economy/GenerationEconomy.js";
import {
  deliverGenerationPurchase,
  getGenerationEconomy,
  handleAppleEconomyNotification,
} from "./http/generationEconomy.js";
import { browserCors } from "./http/browserCors.js";

export function createApp(dependencies: {
  jobs: DevotionalMovieJobs;
  enhancedStills?: EnhancedStillGenerating;
  economy?: GenerationEconomyManaging;
  purchaseVerifier?: ConsumableTransactionVerifying;
  appleNotificationVerifier?: AppleEconomyNotificationVerifying;
  mobileVerifier: MobileRequestVerifier;
  taskVerifier: TaskRequestVerifier;
  webAllowedOrigins?: readonly string[];
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.set({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    });
    next();
  });
  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.use("/v1", browserCors(dependencies.webAllowedOrigins ?? []));

  const mobileAuth = authenticateMobile(dependencies.mobileVerifier);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 2, fields: 2, parts: 4 },
  });
  app.post(
    "/v1/devotional-movies",
    mobileAuth,
    upload.fields([
      { name: "artwork", maxCount: 1 },
      { name: "metadata", maxCount: 1 },
    ]),
    createDevotionalMovie(dependencies.jobs),
  );
  app.get(
    "/v1/devotional-movies/attempts/:attemptId",
    mobileAuth,
    getDevotionalMovieAttempt(dependencies.jobs),
  );
  if (dependencies.enhancedStills !== undefined) {
    app.post(
      "/v1/enhanced-stills",
      mobileAuth,
      upload.fields([
        { name: "source", maxCount: 1 },
        { name: "metadata", maxCount: 1 },
      ]),
      createEnhancedStill(dependencies.enhancedStills),
    );
  }
  if (dependencies.economy !== undefined) {
    app.get("/v1/generation-economy", mobileAuth, getGenerationEconomy(dependencies.economy));
  }
  if (dependencies.economy !== undefined && dependencies.purchaseVerifier !== undefined) {
    app.post(
      "/v1/generation-economy/apple-transactions",
      mobileAuth,
      express.json({ limit: "80kb" }),
      deliverGenerationPurchase(dependencies.economy, dependencies.purchaseVerifier),
    );
  }
  if (dependencies.economy !== undefined && dependencies.appleNotificationVerifier !== undefined) {
    app.post(
      "/v1/apple-server-notifications",
      express.json({ limit: "160kb" }),
      handleAppleEconomyNotification(dependencies.economy, dependencies.appleNotificationVerifier),
    );
  }
  app.post(
    "/internal/devotional-movies/:attemptId/process",
    express.json({ limit: "8kb" }),
    authenticateTask(dependencies.taskVerifier),
    processDevotionalMovieTask(dependencies.jobs),
  );

  app.use((_request: Request, _response: Response, next: NextFunction) => {
    next(new HttpError(404, "not_found", "Route was not found."));
  });
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    if (error instanceof multer.MulterError) {
      const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      response.status(status).json({ error: { code: "invalid_multipart", message: "Upload is invalid." } });
      return;
    }
    console.error("request_failed", error instanceof Error ? error.name : "unknown_error");
    response.status(503).json({
      error: { code: "temporarily_unavailable", message: "Video creation is temporarily unavailable." },
    });
  });
  return app;
}
