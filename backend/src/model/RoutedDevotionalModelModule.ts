import type {
  CreationAttempt,
  DevotionalModelModule,
  PaidSubmissionLifecycle,
  ProviderVideo,
} from "../devotional-movie/contracts.js";
import { DevotionalMovieDirector } from "../devotional-movie/DevotionalMovieDirector.js";

/**
 * Deep model module that owns profile selection and in-flight resume routing.
 * A deployment may make a new profile active while retaining older directors until their
 * persisted operations have reached a terminal state.
 */
export class RoutedDevotionalModelModule implements DevotionalModelModule {
  private readonly directors: ReadonlyMap<string, DevotionalMovieDirector>;

  constructor(
    readonly activeProfileVersion: string,
    profiles: ReadonlyMap<string, DevotionalMovieDirector>,
  ) {
    if (!profiles.has(activeProfileVersion)) {
      throw new Error(`Active model profile ${activeProfileVersion} is not registered.`);
    }
    this.directors = new Map(profiles);
  }

  async create(
    profileVersion: string,
    attempt: CreationAttempt,
    lifecycle: PaidSubmissionLifecycle,
  ) {
    return await this.resolve(profileVersion).create(attempt, lifecycle);
  }

  async resume(
    profileVersion: string,
    operationId: string,
    personalizedMessage: string,
    localeIdentifier: string,
    lifecycle: PaidSubmissionLifecycle,
  ) {
    return await this.resolve(profileVersion).resume(
      operationId,
      personalizedMessage,
      localeIdentifier,
      lifecycle,
    );
  }

  async finish(
    profileVersion: string,
    video: ProviderVideo,
    personalizedMessage: string,
    localeIdentifier: string,
  ) {
    return await this.resolve(profileVersion).finish(video, personalizedMessage, localeIdentifier);
  }

  private resolve(profileVersion: string): DevotionalMovieDirector {
    const director = this.directors.get(profileVersion);
    if (director === undefined) {
      throw new Error(`Model profile ${profileVersion} is unavailable for safe processing.`);
    }
    return director;
  }
}
