import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { DevotionalMovieJobs } from "../src/devotional-movie/contracts.js";
import type { MobileRequestVerifier, TaskRequestVerifier } from "../src/http/authenticate.js";
import { parseWebAllowedOrigins } from "../src/http/browserCors.js";

const WEB_ORIGIN = "https://ganpati.example";

describe("browser CORS", () => {
  it("protects private responses and errors from caching and browser interpretation", async () => {
    const { app } = makeApp();
    for (const path of ["/health", "/v1/devotional-movies/attempts/missing", "/not-found"]) {
      const response = await request(app).get(path);
      assert.equal(response.headers["cache-control"], "private, no-store");
      assert.equal(response.headers["x-content-type-options"], "nosniff");
      assert.equal(response.headers["x-frame-options"], "DENY");
      assert.equal(response.headers["referrer-policy"], "no-referrer");
      assert.equal(response.headers["x-powered-by"], undefined);
    }
  });

  it("returns CORS response headers only for an exact allowed origin", async () => {
    const harness = makeApp();

    const response = await request(harness.app)
      .get("/v1/devotional-movies/attempts/missing")
      .set(mobileHeaders())
      .set("origin", WEB_ORIGIN);

    assert.equal(response.status, 404);
    assert.equal(response.headers["access-control-allow-origin"], WEB_ORIGIN);
    assert.equal(
      response.headers["access-control-expose-headers"],
      "Retry-After, x-source-composition-hash",
    );
    assert.match(response.headers["vary"] ?? "", /(?:^|,\s*)Origin(?:,|$)/u);
    assert.equal(response.headers["access-control-allow-credentials"], undefined);
    assert.equal(harness.mobileVerificationCount(), 1);
  });

  it("denies a non-allowlisted origin before authentication", async () => {
    const harness = makeApp();

    const response = await request(harness.app)
      .get("/v1/devotional-movies/attempts/missing")
      .set("origin", "https://ganpati.example.evil.invalid");

    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "origin_not_allowed");
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.match(response.headers["vary"] ?? "", /(?:^|,\s*)Origin(?:,|$)/u);
    assert.equal(harness.mobileVerificationCount(), 0);
  });

  it("preserves native requests that do not send Origin", async () => {
    const harness = makeApp();

    const response = await request(harness.app)
      .get("/v1/devotional-movies/attempts/missing")
      .set(mobileHeaders());

    assert.equal(response.status, 404);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.equal(harness.mobileVerificationCount(), 1);
  });

  it("answers an allowed public-route preflight without invoking authentication", async () => {
    const harness = makeApp();

    const response = await request(harness.app)
      .options("/v1/devotional-movies")
      .set("origin", WEB_ORIGIN)
      .set("access-control-request-method", "POST")
      .set(
        "access-control-request-headers",
        "Authorization, Content-Type, X-Firebase-AppCheck, Idempotency-Key",
      );

    assert.equal(response.status, 204);
    assert.equal(response.headers["access-control-allow-origin"], WEB_ORIGIN);
    assert.equal(response.headers["access-control-allow-methods"], "GET, POST");
    assert.equal(
      response.headers["access-control-allow-headers"],
      "Authorization, Content-Type, X-Firebase-AppCheck, Idempotency-Key",
    );
    assert.equal(response.headers["access-control-allow-credentials"], undefined);
    assert.equal(harness.mobileVerificationCount(), 0);
  });

  it("does not expose or preflight the internal Cloud Tasks route", async () => {
    const harness = makeApp();

    const response = await request(harness.app)
      .options("/internal/devotional-movies/attempt/process")
      .set("origin", WEB_ORIGIN)
      .set("access-control-request-method", "POST");

    assert.equal(response.status, 404);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
    assert.equal(response.headers["access-control-allow-methods"], undefined);
    assert.equal(harness.taskVerificationCount(), 0);
  });

  it("rejects wildcard and non-origin configuration", () => {
    assert.throws(() => parseWebAllowedOrigins("*"), /invalid origin/u);
    assert.throws(
      () => parseWebAllowedOrigins("https://ganpati.example/path"),
      /exact HTTP\(S\) origins/u,
    );
  });

  it("allows plaintext HTTP only for loopback development origins", () => {
    assert.deepEqual(
      parseWebAllowedOrigins("http://localhost:4173,http://127.0.0.1:4173"),
      ["http://localhost:4173", "http://127.0.0.1:4173"],
    );
    assert.throws(
      () => parseWebAllowedOrigins("http://studio.example"),
      /HTTPS unless it is a loopback development origin/u,
    );
  });
});

function makeApp() {
  let mobileVerifications = 0;
  let taskVerifications = 0;
  const jobs = {
    findOwned: async () => null,
  } as unknown as DevotionalMovieJobs;
  const mobileVerifier: MobileRequestVerifier = {
    verify: async () => {
      mobileVerifications += 1;
      return { ownerId: "owner-a" };
    },
  };
  const taskVerifier: TaskRequestVerifier = {
    verify: async () => {
      taskVerifications += 1;
    },
  };
  return {
    app: createApp({
      jobs,
      mobileVerifier,
      taskVerifier,
      webAllowedOrigins: [WEB_ORIGIN],
    }),
    mobileVerificationCount: () => mobileVerifications,
    taskVerificationCount: () => taskVerifications,
  };
}

function mobileHeaders() {
  return {
    authorization: "Bearer owner-a",
    "x-firebase-appcheck": "valid-app-check",
  };
}
