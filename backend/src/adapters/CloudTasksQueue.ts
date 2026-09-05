import { CloudTasksClient } from "@google-cloud/tasks";
import { createHash } from "node:crypto";
import type {
  DurableTaskQueue,
  EnqueuedTask,
  ProcessAttemptTask,
} from "../devotional-movie/contracts.js";

type GoogleError = Error & { code?: number };

export class CloudTasksQueue implements DurableTaskQueue {
  private readonly parent: string;

  constructor(
    projectId: string,
    location: string,
    queue: string,
    private readonly workerBaseURL: string,
    private readonly serviceAccountEmail: string,
    private readonly audience: string,
    private readonly client: CloudTasksClient = new CloudTasksClient(),
  ) {
    this.parent = this.client.queuePath(projectId, location, queue);
  }

  async enqueue(input: ProcessAttemptTask): Promise<EnqueuedTask> {
    const shortDigest = createHash("sha256")
      .update(`${input.ownerId}:${input.attemptId}`)
      .digest("hex")
      .slice(0, 40);
    const taskName = `${this.parent}/tasks/devotional-${shortDigest}`;
    try {
      await this.client.createTask({
        parent: this.parent,
        task: {
          name: taskName,
          // The queue's normal path includes generation plus deterministic FFmpeg finishing.
          // Make the per-dispatch deadline match the long-running worker contract instead of
          // inheriting Cloud Tasks' shorter default.
          dispatchDeadline: { seconds: 1_800 },
          httpRequest: {
            httpMethod: "POST",
            url: `${this.workerBaseURL}/internal/devotional-movies/${input.attemptId}/process`,
            headers: { "Content-Type": "application/json" },
            body: Buffer.from(JSON.stringify({ ownerId: input.ownerId })),
            oidcToken: {
              serviceAccountEmail: this.serviceAccountEmail,
              audience: this.audience,
            },
          },
        },
      });
    } catch (error) {
      if ((error as GoogleError).code !== 6) throw error;
    }
    return { taskName };
  }
}
