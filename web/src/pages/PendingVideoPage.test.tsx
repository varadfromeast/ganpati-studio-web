import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PendingVideoPage } from "./PendingVideoPage";
import { BackendError } from "../services/backend";
const mocks = vi.hoisted(() => ({
  clearPendingVideo: vi.fn(), downloadVideo: vi.fn(), fetchVideoAttempt: vi.fn(),
  loadDesign: vi.fn(), savePendingVideo: vi.fn(), createDevotionalVideo: vi.fn(),
  loadPendingVideo: vi.fn(), requestPersistentStorage: vi.fn(), saveVideo: vi.fn(),
}));
vi.mock("../hooks/useObjectUrl", () => ({ useObjectUrl: (blob: Blob | null) => blob ? "blob:finished-video" : null }));
vi.mock("../services/persistence", () => mocks);
vi.mock("../services/backend", () => ({
  BackendError: class BackendError extends Error { constructor(public status: number) { super("Backend error"); } },
  createDevotionalVideo: mocks.createDevotionalVideo,
  downloadVideo: mocks.downloadVideo, fetchVideoAttempt: mocks.fetchVideoAttempt, sha256: async () => "a".repeat(64),
}));
const processing = { kind: "processing", attemptId: "attempt-1", retryAfterSeconds: 3 };
const movie = new Blob(["mp4"], { type: "video/mp4" });
const ready = {
  kind: "ready", id: "movie_attempt-1", personalizedMessage: "May joy fill your home.",
  download: { url: "https://storage.example/video.mp4", byteCount: movie.size, sha256: "a".repeat(64), mediaType: "video/mp4", durationSeconds: 6 },
};
async function flush() { await act(async () => { await vi.advanceTimersByTimeAsync(0); }); }
function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}
function setVisible(visible: boolean) {
  Object.defineProperty(document, "visibilityState", { configurable: true, value: visible ? "visible" : "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
}
function renderPage() {
  return render(<MemoryRouter initialEntries={["/videos/pending/attempt-1"]}><Routes>
    <Route path="/videos/pending/:attemptId" element={<PendingVideoPage />} />
  </Routes></MemoryRouter>);
}
describe("PendingVideoPage recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); setOnline(true); setVisible(true);
    mocks.loadPendingVideo.mockResolvedValue({ attemptId: "attempt-1", designId: "design-1", dedication: "May joy fill your home." });
    mocks.fetchVideoAttempt.mockResolvedValue(processing);
    mocks.downloadVideo.mockResolvedValue(movie);
    mocks.saveVideo.mockResolvedValue(undefined);
    mocks.clearPendingVideo.mockResolvedValue(undefined);
    mocks.requestPersistentStorage.mockResolvedValue(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => movie }));
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("replays an interrupted upload with its original attempt and exact source", async () => {
    mocks.loadPendingVideo.mockResolvedValue({ attemptId: "attempt-1", designId: "design-1", dedication: "Bless our home", localeIdentifier: "mr-IN", requestState: "submitting" });
    const artwork = new Blob(["source"]);
    mocks.loadDesign.mockResolvedValue({ artwork, artworkSHA256: "source-hash" });
    mocks.createDevotionalVideo.mockResolvedValue(processing);
    mocks.savePendingVideo.mockResolvedValue(undefined);
    renderPage(); await flush();
    expect(mocks.loadPendingVideo).toHaveBeenCalledWith("attempt-1");
    expect(mocks.createDevotionalVideo).toHaveBeenCalledWith(expect.objectContaining({ attemptId: "attempt-1", artwork, artworkSHA256: "source-hash", dedication: "Bless our home", localeIdentifier: "mr-IN" }), expect.anything());
    expect(mocks.savePendingVideo).toHaveBeenCalledWith(expect.objectContaining({ attemptId: "attempt-1", requestState: "accepted" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(mocks.createDevotionalVideo).toHaveBeenCalledTimes(1);
  });
  it("still warns about quota failure after the tab becomes hidden", async () => {
    let rejectSave!: (error: unknown) => void;
    mocks.fetchVideoAttempt.mockResolvedValue(ready);
    mocks.saveVideo.mockReturnValue(new Promise((_, reject) => { rejectSave = reject; }));
    renderPage(); await flush();
    act(() => setVisible(false));
    rejectSave(new DOMException("Quota exceeded", "QuotaExceededError")); await flush();
    expect(screen.getByText(/couldn’t save.*device/i)).toBeInTheDocument();
    expect(document.querySelector("video")).toHaveAttribute("src", "blob:finished-video");
  });
  it("removes an expired shortcut so newer pending requests remain discoverable", async () => {
    mocks.fetchVideoAttempt.mockRejectedValue(new BackendError(404, "attempt_not_found", "Missing"));
    renderPage(); await flush();
    expect(mocks.clearPendingVideo).toHaveBeenCalledWith("attempt-1");
    expect(screen.getByText(/This request could not be found/)).toBeInTheDocument();
  });
  it("does not poll in a hidden tab and resumes once when visible", async () => {
    setVisible(false); renderPage(); await flush();
    expect(mocks.fetchVideoAttempt).not.toHaveBeenCalled();
    act(() => setVisible(true)); await flush();
    expect(mocks.fetchVideoAttempt).toHaveBeenCalledTimes(1);
  });
  it("cancels an offline status check and ignores its late ready result", async () => {
    let resolveStatus!: (value: unknown) => void;
    mocks.fetchVideoAttempt.mockReturnValueOnce(new Promise((resolve) => { resolveStatus = resolve; }));
    renderPage(); await flush();
    const signal = mocks.fetchVideoAttempt.mock.calls[0]?.[1]?.signal as AbortSignal | undefined;
    act(() => setOnline(false)); await flush();
    expect(signal?.aborted).toBe(true);
    resolveStatus(ready); await flush();
    expect(mocks.saveVideo).not.toHaveBeenCalled();
    expect(screen.queryByText("Video ready.")).not.toBeInTheDocument();
    act(() => setOnline(true)); await flush();
    expect(mocks.fetchVideoAttempt).toHaveBeenCalledTimes(2);
  });
  it("leaves no timer or save behind after unmount during a check", async () => {
    let resolveStatus!: (value: unknown) => void;
    mocks.fetchVideoAttempt.mockReturnValueOnce(new Promise((resolve) => { resolveStatus = resolve; }));
    const page = renderPage(); await flush(); page.unmount(); resolveStatus(ready); await flush();
    expect(mocks.saveVideo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps a playable video and pending recovery when browser storage is full", async () => {
    mocks.fetchVideoAttempt.mockResolvedValue(ready);
    mocks.saveVideo.mockRejectedValue(new DOMException("Quota exceeded", "QuotaExceededError"));
    renderPage(); await flush();
    expect(screen.getByText("Video ready.")).toBeInTheDocument();
    expect(document.querySelector("video")).toHaveAttribute("src", "blob:finished-video");
    expect(screen.getByText(/couldn’t save.*device/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Share or save video/i })).toBeEnabled();
    expect(mocks.clearPendingVideo).not.toHaveBeenCalled();
    expect(mocks.requestPersistentStorage).toHaveBeenCalled();
    mocks.saveVideo.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole("button", { name: /Try saving again/i })); await flush();
    expect(mocks.downloadVideo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/couldn’t save.*device/i)).not.toBeInTheDocument();
  });
  it("retries transient failures with increasing bounded delay", async () => {
    mocks.fetchVideoAttempt.mockRejectedValue(new TypeError("Connection interrupted")); renderPage(); await flush();
    expect(mocks.fetchVideoAttempt).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.fetchVideoAttempt).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.fetchVideoAttempt).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.fetchVideoAttempt).toHaveBeenCalledTimes(3);
  });
  it("can recover a route even when local pending metadata cannot be read", async () => {
    mocks.loadPendingVideo.mockRejectedValue(new Error("Storage unavailable")); renderPage(); await flush();
    expect(mocks.fetchVideoAttempt).toHaveBeenCalledTimes(1);
  });
});
