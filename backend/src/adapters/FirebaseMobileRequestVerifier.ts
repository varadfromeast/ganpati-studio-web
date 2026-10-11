import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import type { MobileRequestVerifier } from "../http/authenticate.js";
import { HttpError } from "../devotional-movie/errors.js";

function ensureFirebaseAdmin() {
  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }
}

export class FirebaseMobileRequestVerifier implements MobileRequestVerifier {
  private readonly expectedAppIds: ReadonlySet<string>;
  private readonly services: FirebaseVerifierServices;

  constructor(
    expectedAppIds: string | readonly string[],
    services?: FirebaseVerifierServices,
  ) {
    this.expectedAppIds = new Set(parseFirebaseAppIds(expectedAppIds));
    if (services === undefined) {
      ensureFirebaseAdmin();
      this.services = {
        verifyIdToken: async (token) => await getAuth().verifyIdToken(token, true),
        verifyAppCheckToken: async (token) => await getAppCheck().verifyToken(token),
      };
    } else {
      this.services = services;
    }
  }

  async verify(idToken: string, appCheckToken: string) {
    let identity;
    try {
      identity = await this.services.verifyIdToken(idToken);
    } catch {
      throw new HttpError(401, "invalid_identity_token", "Authentication could not be verified.");
    }
    try {
      const attestation = await this.services.verifyAppCheckToken(appCheckToken);
      if (!this.expectedAppIds.has(attestation.appId)) {
        throw new Error("Unexpected Firebase app ID.");
      }
    } catch {
      throw new HttpError(403, "invalid_app_check_token", "App attestation could not be verified.");
    }
    return { ownerId: identity.uid };
  }
}

export interface FirebaseVerifierServices {
  verifyIdToken(token: string): Promise<{ uid: string }>;
  verifyAppCheckToken(token: string): Promise<{ appId: string }>;
}

export function parseFirebaseAppIds(rawAppIds: string | readonly string[]): readonly string[] {
  const entries = typeof rawAppIds === "string" ? [rawAppIds] : rawAppIds;
  const appIds = new Set(
    entries.flatMap((entry) => entry.split(",")).map((entry) => entry.trim()).filter(Boolean),
  );
  if (appIds.size === 0) throw new Error("At least one Firebase app ID is required.");
  return [...appIds];
}
