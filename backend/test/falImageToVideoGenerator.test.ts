import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { FalImageToVideoGenerator } from "../src/adapters/FalImageToVideoGenerator.js";
import { falVideoProfile } from "../src/model/falVideoProfiles.js";

describe("FalImageToVideoGenerator", () => {
  it("persists the queue request before polling and maps the audited profile", async () => {
    const events: string[] = [];
    let submittedInput: Record<string, unknown> | undefined;
    const client = {
      uploadImage: mock.fn(async () => {
        events.push("upload");
        return "https://storage.invalid/source.png";
      }),
      submit: mock.fn(async (_endpointId: string, input: Record<string, unknown>) => {
        events.push("submit");
        submittedInput = input;
        return "fal-request-1";
      }),
      status: mock.fn(async () => {
        events.push("status");
        return { status: "COMPLETED" as const };
      }),
      result: mock.fn(async () => {
        events.push("result");
        return {
          video: { url: "https://v3b.fal.media/files/video.mp4", content_type: "video/mp4" },
        };
      }),
    };
    const fetchVideo = mock.fn<typeof fetch>(async () => {
      events.push("download");
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    });
    const generator = new FalImageToVideoGenerator(
      "not-a-real-key",
      falVideoProfile("gemini-text-fal-ltx-2.5-fast-v1"),
      client,
      fetchVideo,
    );

    const video = await generator.generate({
      sourceArtwork: new Uint8Array([9, 8, 7]),
      trustedPrompt: "Reviewed gentle devotional motion only.",
      durationSeconds: 6,
      width: 720,
      height: 1280,
    }, async (operationId) => {
      events.push(`persist:${operationId}`);
    });

    assert.deepEqual(video.bytes, new Uint8Array([1, 2, 3]));
    assert.deepEqual(events, [
      "upload",
      "submit",
      "persist:fal-request-1",
      "status",
      "result",
      "download",
    ]);
    assert.deepEqual(submittedInput, {
      image_url: "https://storage.invalid/source.png",
      prompt: "Reviewed gentle devotional motion only.",
      resolution: "720p",
      aspect_ratio: "9:16",
      duration: 6,
      fps: 25,
      generate_audio: false,
    });
  });

  it("resumes without uploading or submitting another paid operation", async () => {
    const client = {
      uploadImage: mock.fn(async () => "unused"),
      submit: mock.fn(async () => "unused"),
      status: mock.fn(async () => ({ status: "COMPLETED" as const })),
      result: mock.fn(async () => ({ video: { url: "https://v3.fal.media/files/video.mp4" } })),
    };
    const generator = new FalImageToVideoGenerator(
      "not-a-real-key",
      falVideoProfile("gemini-text-fal-wan-2.2-turbo-v1"),
      client,
      async () => new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }),
    );

    const video = await generator.resume("existing-request");

    assert.deepEqual(video.bytes, new Uint8Array([4, 5, 6]));
    assert.equal(client.uploadImage.mock.calls.length, 0);
    assert.equal(client.submit.mock.calls.length, 0);
    assert.deepEqual(client.status.mock.calls[0]?.arguments, [
      "fal-ai/wan/v2.2-a14b/image-to-video/turbo",
      "existing-request",
    ]);
  });

  it("rejects non-HTTPS and non-allowlisted result hosts before download", async () => {
    for (const url of [
      "http://v3.fal.media/files/video.mp4",
      "https://v3.fal.media.evil.example/video.mp4",
      "https://metadata.google.internal/computeMetadata/v1/",
    ]) {
      let fetched = false;
      const generator = resultGenerator(url, async () => {
        fetched = true;
        return new Response();
      });
      await assert.rejects(generator.resume("existing-request"), /allowed HTTPS media host/u);
      assert.equal(fetched, false);
    }
  });

  it("revalidates every redirect and rejects a redirect to a disallowed host", async () => {
    const visited: string[] = [];
    const generator = resultGenerator("https://v3.fal.media/files/video.mp4", async (url) => {
      visited.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: "https://metadata.google.internal/computeMetadata/v1/" },
      });
    });

    await assert.rejects(generator.resume("existing-request"), /allowed HTTPS media host/u);
    assert.deepEqual(visited, ["https://v3.fal.media/files/video.mp4"]);
  });

  it("follows a bounded redirect between explicitly allowed fal media hosts", async () => {
    const visited: string[] = [];
    const generator = resultGenerator("https://v3.fal.media/files/video.mp4", async (url, init) => {
      visited.push(String(url));
      assert.equal(init?.redirect, "manual");
      if (visited.length === 1) {
        return new Response(null, {
          status: 307,
          headers: { location: "https://v3b.fal.media/files/video.mp4" },
        });
      }
      return new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: { "content-type": "video/mp4" },
      });
    });

    const video = await generator.resume("existing-request");
    assert.deepEqual(video.bytes, new Uint8Array([7, 8, 9]));
    assert.deepEqual(visited, [
      "https://v3.fal.media/files/video.mp4",
      "https://v3b.fal.media/files/video.mp4",
    ]);
  });
});

function resultGenerator(url: string, fetchVideo: typeof fetch) {
  return new FalImageToVideoGenerator(
    "not-a-real-key",
    falVideoProfile("gemini-text-fal-ltx-2.5-fast-v1"),
    {
      uploadImage: async () => "unused",
      submit: async () => "unused",
      status: async () => ({ status: "COMPLETED" as const }),
      result: async () => ({ video: { url, content_type: "video/mp4" } }),
    },
    fetchVideo,
  );
}
