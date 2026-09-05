import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../devotional-movie/errors.js";

const ALLOWED_METHODS = new Set(["GET", "POST"]);
const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "X-Firebase-AppCheck",
  "Idempotency-Key",
] as const;
const ALLOWED_HEADER_NAMES = new Set(ALLOWED_HEADERS.map((header) => header.toLowerCase()));
const EXPOSED_HEADERS = ["Retry-After", "x-source-composition-hash"] as const;

export function parseWebAllowedOrigins(rawOrigins: string | undefined): readonly string[] {
  if (rawOrigins === undefined || rawOrigins.trim().length === 0) return [];
  return validateOrigins(rawOrigins.split(",").map((origin) => origin.trim()).filter(Boolean));
}

export function browserCors(allowedOrigins: readonly string[]) {
  const origins = new Set(validateOrigins(allowedOrigins));

  return (request: Request, response: Response, next: NextFunction) => {
    response.vary("Origin");
    const origin = request.header("origin");
    if (origin === undefined) {
      next();
      return;
    }
    if (!origins.has(origin)) {
      next(new HttpError(403, "origin_not_allowed", "Browser origin is not allowed."));
      return;
    }

    response.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Expose-Headers": EXPOSED_HEADERS.join(", "),
    });
    if (request.method !== "OPTIONS") {
      next();
      return;
    }

    const requestedMethod = request.header("access-control-request-method")?.toUpperCase();
    if (requestedMethod !== undefined && !ALLOWED_METHODS.has(requestedMethod)) {
      next(new HttpError(403, "cors_method_not_allowed", "Browser request method is not allowed."));
      return;
    }
    const requestedHeaders = (request.header("access-control-request-headers") ?? "")
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);
    if (requestedHeaders.some((header) => !ALLOWED_HEADER_NAMES.has(header))) {
      next(new HttpError(403, "cors_header_not_allowed", "Browser request header is not allowed."));
      return;
    }

    response.vary("Access-Control-Request-Method");
    response.vary("Access-Control-Request-Headers");
    response.set({
      "Access-Control-Allow-Methods": [...ALLOWED_METHODS].join(", "),
      "Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
      "Access-Control-Max-Age": "600",
    });
    response.status(204).end();
  };
}

function validateOrigins(allowedOrigins: readonly string[]): readonly string[] {
  const uniqueOrigins = new Set<string>();
  for (const origin of allowedOrigins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`WEB_ALLOWED_ORIGINS contains an invalid origin: ${origin}`);
    }
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.origin !== origin
    ) {
      throw new Error(`WEB_ALLOWED_ORIGINS must contain exact HTTP(S) origins: ${origin}`);
    }
    const loopback = parsed.hostname === "localhost"
      || parsed.hostname === "127.0.0.1"
      || parsed.hostname === "[::1]";
    if (parsed.protocol === "http:" && !loopback) {
      throw new Error(
        `WEB_ALLOWED_ORIGINS must use HTTPS unless it is a loopback development origin: ${origin}`,
      );
    }
    uniqueOrigins.add(origin);
  }
  return [...uniqueOrigins];
}
