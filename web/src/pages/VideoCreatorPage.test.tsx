import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoCreatorPage } from "./VideoCreatorPage";

const mocks = vi.hoisted(() => ({
  clearPendingVideo: vi.fn(),
  createDevotionalVideo: vi.fn(),
  fetchEconomy: vi.fn(),
  loadDesign: vi.fn(),
  savePendingVideo: vi.fn(),
}));

vi.mock("../hooks/useObjectUrl", () => ({ useObjectUrl: () => "blob:test-design" }));
vi.mock("../services/firebase", () => ({ hasCloudConfiguration: () => true }));
vi.mock("../services/persistence", () => ({
  clearPendingVideo: mocks.clearPendingVideo,
  loadDesign: mocks.loadDesign,
  savePendingVideo: mocks.savePendingVideo,
}));
vi.mock("../services/backend", () => ({
  BackendError: class BackendError extends Error {
    constructor(public status: number) {
      super("Backend error");
    }
  },
  createDevotionalVideo: mocks.createDevotionalVideo,
  fetchEconomy: mocks.fetchEconomy,
  hasBackendConfiguration: () => true,
}));

const design = {
  id: "design-1",
  packId: "seated",
  packTitle: "Seated Blessing",
  selections: { crown: "crown.royal" },
  artwork: new Blob(["png"], { type: "image/png" }),
  artworkSHA256: "abc123",
  createdAt: "2026-09-04T00:00:00.000Z",
};

describe("VideoCreatorPage request durability", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadDesign.mockResolvedValue(design);
    mocks.fetchEconomy.mockResolvedValue({ credits: 1 });
    mocks.savePendingVideo.mockResolvedValue(undefined);
    mocks.clearPendingVideo.mockResolvedValue(undefined);
  });

  it("does not upload or navigate when saving the initial request fails", async () => {
    mocks.savePendingVideo.mockRejectedValue(new DOMException("Quota exceeded", "QuotaExceededError"));
    renderPage();
    fireEvent.click(await screen.findByText("Create video · 1 credit", { selector: "button" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No video was started");
    expect(mocks.createDevotionalVideo).not.toHaveBeenCalled();
    expect(screen.queryByText("Pending request route")).not.toBeInTheDocument();
  });
  it("clears a definitely rejected request instead of showing it as pending", async () => {
    mocks.createDevotionalVideo.mockResolvedValue({
      kind: "rejected",
      code: "devotional_request_not_allowed",
      message: "Please revise this blessing.",
    });
    renderPage();

    fireEvent.click(await screen.findByText("Create video · 1 credit", { selector: "button" }));

    await waitFor(() => expect(mocks.clearPendingVideo).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("Please revise this blessing.");
    expect(mocks.savePendingVideo).toHaveBeenCalledTimes(1);
    expect(mocks.savePendingVideo.mock.calls[0]?.[0]).toMatchObject({ requestState: "submitting" });
  });

  it("keeps the same saved attempt when the POST response is ambiguous", async () => {
    mocks.createDevotionalVideo.mockRejectedValue(new TypeError("Network connection lost"));
    renderPage();

    fireEvent.click(await screen.findByText("Create video · 1 credit", { selector: "button" }));

    expect(await screen.findByText("Pending request route")).toBeInTheDocument();
    expect(mocks.clearPendingVideo).not.toHaveBeenCalled();
    expect(mocks.savePendingVideo).toHaveBeenCalledTimes(1);
  });

  it("marks an accepted attempt before navigating to progress", async () => {
    mocks.createDevotionalVideo.mockResolvedValue({
      kind: "processing",
      attemptId: "attempt-1",
      retryAfterSeconds: 3,
    });
    renderPage();

    fireEvent.click(await screen.findByText("Create video · 1 credit", { selector: "button" }));

    expect(await screen.findByText("Pending request route")).toBeInTheDocument();
    expect(mocks.savePendingVideo).toHaveBeenCalledTimes(2);
    expect(mocks.savePendingVideo.mock.calls[1]?.[0]).toMatchObject({ requestState: "accepted" });
  });
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/video/new?design=design-1"]}>
      <Routes>
        <Route path="/video/new" element={<VideoCreatorPage />} />
        <Route path="/videos/pending/:attemptId" element={<div>Pending request route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
