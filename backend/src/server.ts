import { createApp } from "./app.js";
import { CloudTasksQueue } from "./adapters/CloudTasksQueue.js";
import {
  DevelopmentMobileVerifier,
  DevelopmentTaskVerifier,
  FakeMediaFinisher,
  FakeVideoGenerator,
  ProvisionalDevotionalLanguageModel,
} from "./adapters/FakeCreationAdapters.js";
import { FirebaseMobileRequestVerifier } from "./adapters/FirebaseMobileRequestVerifier.js";
import { FirestoreCreationRecordStore } from "./adapters/FirestoreCreationRecordStore.js";
import { FalImageToVideoGenerator } from "./adapters/FalImageToVideoGenerator.js";
import { GeminiStructuredOutputAdapter } from "./adapters/GeminiStructuredOutputAdapter.js";
import { VertexStructuredOutputAdapter } from "./adapters/VertexStructuredOutputAdapter.js";
import { GoogleCloudObjectStore } from "./adapters/GoogleCloudObjectStore.js";
import { GoogleTaskOidcVerifier } from "./adapters/GoogleTaskOidcVerifier.js";
import {
  InMemoryCreationRecordStore,
  InMemoryObjectStore,
  InMemoryTaskQueue,
} from "./adapters/InMemoryAdapters.js";
import { DevotionalMovieDirector } from "./devotional-movie/DevotionalMovieDirector.js";
import { DevotionalMovieJobs } from "./devotional-movie/DevotionalMovieJobs.js";
import type { DevotionalModelModule, MediaFinisher, VideoGenerator } from "./devotional-movie/contracts.js";
import {
  FFmpegMediaFinisher,
  FFmpegStillVideoGenerator,
} from "./devotional-movie/mediaFinishing.js";
import type { MobileRequestVerifier, TaskRequestVerifier } from "./http/authenticate.js";
import { RoutedDevotionalModelModule } from "./model/RoutedDevotionalModelModule.js";
import { StructuredDevotionalLanguageModel } from "./model/StructuredDevotionalLanguageModel.js";
import { OpenAIEnhancedStillGenerator } from "./enhanced-still/EnhancedStillModule.js";
import { AppleConsumableVerifier } from "./economy/AppleConsumableVerifier.js";
import {
  FirestoreGenerationEconomy,
  FirestorePaidGenerationGuard,
  InMemoryGenerationEconomy,
  type ConsumableTransactionVerifying,
  type GenerationEconomyManaging,
} from "./economy/GenerationEconomy.js";
import {
  GEMINI_DEVOTIONAL_MODEL_PROFILE,
  LEGACY_STAGING_MODEL_PROFILE_VERSION,
  PROVISIONAL_MODEL_PROFILE_VERSION,
} from "./model/modelProfiles.js";
import {
  FAL_DEVOTIONAL_VIDEO_PROFILES,
  falVideoProfile,
} from "./model/falVideoProfiles.js";
import { parseWebAllowedOrigins } from "./http/browserCors.js";

type Composition = {
  jobs: DevotionalMovieJobs;
  enhancedStills?: OpenAIEnhancedStillGenerator;
  economy?: GenerationEconomyManaging;
  purchaseVerifier?: ConsumableTransactionVerifying;
  appleNotificationVerifier?: AppleConsumableVerifier;
  mobileVerifier: MobileRequestVerifier;
  taskVerifier: TaskRequestVerifier;
};

const mode = process.env["APP_ENV"] ?? "";
const composition = mode === "local" ? localComposition() : await cloudComposition(mode);
const app = createApp({
  ...composition,
  webAllowedOrigins: parseWebAllowedOrigins(process.env["WEB_ALLOWED_ORIGINS"]),
});
const port = Number(process.env["PORT"] ?? "8080");
app.listen(port, () => console.log(`devotional_movie_backend_listening mode=${mode} port=${port}`));

function localComposition(): Composition {
  if (process.env["ALLOW_INSECURE_DEVELOPMENT_AUTH"] !== "true") {
    throw new Error("Local mode requires ALLOW_INSECURE_DEVELOPMENT_AUTH=true.");
  }
  const models = provisionalModelModule(
    new FakeVideoGenerator(),
    new FakeMediaFinisher(),
  );
  const economy = new InMemoryGenerationEconomy();
  return {
    jobs: new DevotionalMovieJobs(
      new InMemoryCreationRecordStore(),
      new InMemoryObjectStore(),
      new InMemoryTaskQueue(),
      models,
      economy,
    ),
    mobileVerifier: new DevelopmentMobileVerifier(),
    taskVerifier: new DevelopmentTaskVerifier(),
    economy,
  };
}

async function cloudComposition(environment: string): Promise<Composition> {
  if (environment !== "staging-fake" && environment !== "production") {
    throw new Error("APP_ENV must be local, staging-fake, or production.");
  }
  const projectId = requiredEnvironment("GOOGLE_CLOUD_PROJECT");
  const location = requiredEnvironment("CLOUD_TASKS_LOCATION");
  const queue = requiredEnvironment("CLOUD_TASKS_QUEUE");
  const serviceURL = requiredEnvironment("SERVICE_BASE_URL");
  const taskCaller = requiredEnvironment("TASK_CALLER_SERVICE_ACCOUNT");
  const records = new FirestoreCreationRecordStore();
  const economy = new FirestoreGenerationEconomy();
  const objects = new GoogleCloudObjectStore(requiredEnvironment("MOVIE_BUCKET"));
  const tasks = new CloudTasksQueue(
    projectId,
    location,
    queue,
    serviceURL,
    taskCaller,
    serviceURL,
  );
  const models = environment === "staging-fake"
    ? provisionalModelModule(
        new FFmpegStillVideoGenerator(),
        new FFmpegMediaFinisher(),
      )
    : liveModelModule();
  const paidGenerationGuard = environment === "production"
    ? new FirestorePaidGenerationGuard(requiredPositiveInteger(
        "MAX_PAID_VIDEO_SUBMISSIONS_PER_INDIA_DAY",
      ))
    : undefined;
  const purchaseVerifier = await optionalAppleVerifier();
  return {
    jobs: new DevotionalMovieJobs(
      records,
      objects,
      tasks,
      models,
      paidGenerationGuard,
    ),
    mobileVerifier: new FirebaseMobileRequestVerifier(firebaseAppIdsFromEnvironment()),
    taskVerifier: new GoogleTaskOidcVerifier(serviceURL, taskCaller),
    // Production enhancement stays closed until this route has durable credits,
    // idempotency, and spend controls, even if a key is accidentally attached.
    ...(environment === "production" || process.env["OPENAI_API_KEY"] === undefined
      ? {}
      : { enhancedStills: new OpenAIEnhancedStillGenerator(requiredEnvironment("OPENAI_API_KEY")) }),
    economy,
    ...(purchaseVerifier === undefined ? {} : { purchaseVerifier }),
    ...(purchaseVerifier === undefined ? {} : { appleNotificationVerifier: purchaseVerifier }),
  };
}

async function optionalAppleVerifier(): Promise<AppleConsumableVerifier | undefined> {
  const roots = process.env["APPLE_ROOT_CA_PATHS"];
  if (roots === undefined || roots.length === 0) return undefined;
  const environment = process.env["APPLE_STORE_ENVIRONMENT"] === "Production"
    ? "Production" as const
    : "Sandbox" as const;
  const appAppleIdRaw = process.env["APPLE_APP_ID"];
  const appAppleId = appAppleIdRaw === undefined ? undefined : Number(appAppleIdRaw);
  return await AppleConsumableVerifier.configured({
    rootCertificatePaths: roots.split(",").map((value) => value.trim()).filter(Boolean),
    environment,
    bundleId: "com.varad.ganpatistudio",
    ...(appAppleId === undefined ? {} : { appAppleId }),
  });
}

function liveModelModule(): DevotionalModelModule {
  if (process.env["ENABLE_BILLABLE_GENERATION"] !== "true") {
    throw new Error("Production mode requires explicit ENABLE_BILLABLE_GENERATION=true.");
  }
  const structuredProvider = process.env["STRUCTURED_MODEL_PROVIDER"] ?? "vertex";
  const geminiStructuredOutput = structuredProvider === "vertex"
    ? new VertexStructuredOutputAdapter(
        requiredEnvironment("GOOGLE_CLOUD_PROJECT"),
        process.env["VERTEX_LOCATION"] ?? "global",
      )
    : structuredProvider === "developer-api"
      ? new GeminiStructuredOutputAdapter(requiredEnvironment("GEMINI_API_KEY"))
      : (() => {
          throw new Error("STRUCTURED_MODEL_PROVIDER must be vertex or developer-api.");
        })();
  const languageModel = new StructuredDevotionalLanguageModel({
    policy: geminiStructuredOutput,
    narrative: geminiStructuredOutput,
  }, GEMINI_DEVOTIONAL_MODEL_PROFILE.language);
  const directors = new Map<string, DevotionalMovieDirector>();
  const provider = requiredEnvironment("VIDEO_GENERATION_PROVIDER");
  if (provider !== "fal") {
    throw new Error(
      "VIDEO_GENERATION_PROVIDER must be fal; synchronous Gemini video submission is not crash-safe.",
    );
  }

  const falKey = requiredEnvironment("FAL_API_KEY");
  for (const profile of FAL_DEVOTIONAL_VIDEO_PROFILES) {
    directors.set(profile.version, new DevotionalMovieDirector(
      languageModel,
      new FalImageToVideoGenerator(falKey, profile),
      new FFmpegMediaFinisher(),
    ));
  }
  const activeProfile = falVideoProfile(requiredEnvironment("FAL_VIDEO_PROFILE_VERSION"));
  return new RoutedDevotionalModelModule(activeProfile.version, directors);
}

function provisionalModelModule(
  video: VideoGenerator,
  finisher: MediaFinisher,
): DevotionalModelModule {
  const director = new DevotionalMovieDirector(
    new ProvisionalDevotionalLanguageModel(),
    video,
    finisher,
  );
  return new RoutedDevotionalModelModule(
    PROVISIONAL_MODEL_PROFILE_VERSION,
    new Map([
      [PROVISIONAL_MODEL_PROFILE_VERSION, director],
      [LEGACY_STAGING_MODEL_PROFILE_VERSION, director],
    ]),
  );
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required.`);
  return value;
}

function firebaseAppIdsFromEnvironment(): string {
  const appIds = process.env["FIREBASE_APP_IDS"];
  if (appIds !== undefined && appIds.trim().length > 0) return appIds;
  return requiredEnvironment("FIREBASE_APP_ID");
}

function requiredPositiveInteger(name: string): number {
  const value = Number(requiredEnvironment(name));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
