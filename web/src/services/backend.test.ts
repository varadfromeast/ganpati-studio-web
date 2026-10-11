import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEconomy, fetchVideoAttempt } from "./backend";
const mocks = vi.hoisted(() => ({ requestCredentials: vi.fn() }));
vi.mock("./firebase", () => ({ requestCredentials: mocks.requestCredentials }));
describe("backend request deadlines and cancellation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_BACKEND_URL", "https://backend.example");
    mocks.requestCredentials.mockResolvedValue({ idToken: "id-token", appCheckToken: "app-check" });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("bounds credential retrieval and never sends a late request", async () => {
    let credentialsReady!: (value: { idToken: string; appCheckToken: string }) => void;
    mocks.requestCredentials.mockReturnValue(new Promise((resolve) => { credentialsReady = resolve; }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = fetchEconomy({ timeoutMs: 25 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);
    expect(await Promise.race([result, Promise.resolve("still waiting")])).toMatchObject({ code: "request_timeout" });
    credentialsReady({ idToken: "late", appCheckToken: "late" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("keeps the deadline active while the response body is stalled", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => {
      requestSignal = init.signal;
      return Promise.resolve({ ok: true, json: () => new Promise(() => undefined) });
    }));
    const result = fetchEconomy({ timeoutMs: 25 }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(25);
    expect(await Promise.race([result, Promise.resolve("still waiting")])).toMatchObject({ code: "request_timeout" });
    expect(requestSignal?.aborted).toBe(true);
  });
  it("aborts the network when the page cancels its status check", async () => {
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init) => { requestSignal = init.signal; return new Promise(() => undefined); }));
    const controller = new AbortController();
    const result = fetchVideoAttempt("attempt-1", { signal: controller.signal }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(await Promise.race([result, Promise.resolve("still waiting")])).toMatchObject({ name: "AbortError" });
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not authenticate or fetch when already cancelled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    const result = await fetchEconomy({ signal: controller.signal }).catch((error: unknown) => error);
    expect(result).toMatchObject({ name: "AbortError" });
    expect(mocks.requestCredentials).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
