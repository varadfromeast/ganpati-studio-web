import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FirebaseMobileRequestVerifier,
  parseFirebaseAppIds,
  type FirebaseVerifierServices,
} from "../src/adapters/FirebaseMobileRequestVerifier.js";
import { HttpError } from "../src/devotional-movie/errors.js";

describe("FirebaseMobileRequestVerifier", () => {
  it("accepts App Check tokens from any configured Firebase app ID", async () => {
    let appId = "ios-app-id";
    const services: FirebaseVerifierServices = {
      verifyIdToken: async () => ({ uid: "owner-a" }),
      verifyAppCheckToken: async () => ({ appId }),
    };
    const verifier = new FirebaseMobileRequestVerifier(
      "ios-app-id, web-app-id",
      services,
    );

    assert.deepEqual(await verifier.verify("identity", "app-check"), { ownerId: "owner-a" });
    appId = "web-app-id";
    assert.deepEqual(await verifier.verify("identity", "app-check"), { ownerId: "owner-a" });
  });

  it("still rejects an App Check token from an unconfigured app", async () => {
    const verifier = new FirebaseMobileRequestVerifier(
      ["ios-app-id", "web-app-id"],
      {
        verifyIdToken: async () => ({ uid: "owner-a" }),
        verifyAppCheckToken: async () => ({ appId: "other-app-id" }),
      },
    );

    await assert.rejects(
      verifier.verify("identity", "app-check"),
      (error) => error instanceof HttpError &&
        error.status === 403 &&
        error.code === "invalid_app_check_token",
    );
  });

  it("keeps a single FIREBASE_APP_ID-compatible value valid", () => {
    assert.deepEqual(parseFirebaseAppIds("ios-app-id"), ["ios-app-id"]);
  });
});
