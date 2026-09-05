import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";

export type RequestCredentials = {
  idToken: string;
  appCheckToken: string;
};

type FirebaseRuntime = {
  app: FirebaseApp;
  auth: Auth;
  appCheck: AppCheck;
};

let runtimePromise: Promise<FirebaseRuntime> | undefined;

function firebaseConfiguration() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
  return Object.values(config).every((value) => typeof value === "string" && value.length > 0)
    ? config
    : null;
}

async function currentUser(auth: Auth): Promise<User> {
  if (auth.currentUser) return auth.currentUser;
  const restored = await new Promise<User | null>((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
  return restored ?? (await signInAnonymously(auth)).user;
}

async function initializeRuntime(): Promise<FirebaseRuntime> {
  const config = firebaseConfiguration();
  const siteKey = import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY;
  if (!config || !siteKey) {
    throw new Error(
      "AI creation is not configured yet. Add the public Firebase web settings to web/.env.local.",
    );
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return { app, auth, appCheck };
}

function runtime(): Promise<FirebaseRuntime> {
  runtimePromise ??= initializeRuntime().catch((error: unknown) => {
    runtimePromise = undefined;
    throw error;
  });
  return runtimePromise;
}

export function hasCloudConfiguration(): boolean {
  return Boolean(firebaseConfiguration() && import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY);
}

export async function requestCredentials(): Promise<RequestCredentials> {
  if (import.meta.env.DEV && import.meta.env.VITE_USE_DEVELOPMENT_AUTH === "true") {
    return {
      idToken: "development-user:web-local",
      appCheckToken: "development-app-check",
    };
  }

  const configured = await runtime();
  const user = await currentUser(configured.auth);
  const [idToken, appCheckResult] = await Promise.all([
    user.getIdToken(),
    getToken(configured.appCheck),
  ]);
  return { idToken, appCheckToken: appCheckResult.token };
}
