import { OAuth2Client } from "google-auth-library";
import type { TaskRequestVerifier } from "../http/authenticate.js";
import { HttpError } from "../devotional-movie/errors.js";

export class GoogleTaskOidcVerifier implements TaskRequestVerifier {
  private readonly client = new OAuth2Client();

  constructor(
    private readonly expectedAudience: string,
    private readonly expectedServiceAccountEmail: string,
  ) {}

  async verify(authorization: string): Promise<void> {
    const match = /^Bearer (.+)$/i.exec(authorization);
    if (match?.[1] === undefined) {
      throw new HttpError(401, "invalid_task_identity", "Task authentication is required.");
    }
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: match[1],
        audience: this.expectedAudience,
      });
      const payload = ticket.getPayload();
      if (
        payload?.email !== this.expectedServiceAccountEmail ||
        payload.email_verified !== true
      ) {
        throw new Error("Unexpected task caller.");
      }
    } catch {
      throw new HttpError(401, "invalid_task_identity", "Task identity could not be verified.");
    }
  }
}
