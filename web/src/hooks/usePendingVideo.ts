import { useEffect, useState } from "react";
import { BackendError, createDevotionalVideo, downloadVideo, fetchVideoAttempt } from "../services/backend";
import { clearPendingVideo, loadDesign, loadPendingVideo, savePendingVideo, requestPersistentStorage, saveVideo, type PendingVideo, type SavedVideo } from "../services/persistence";

type VideoState =
  | { kind: "loading" | "processing" }
  | { kind: "ready"; video: SavedVideo; storageError: boolean }
  | { kind: "failed" | "rejected"; message: string; resumable: boolean }
  | { kind: "error"; message: string };

/** Owns request recovery; callers only render state and request a retry. */
export function usePendingVideo(attemptId: string) {
  const [pending, setPending] = useState<PendingVideo | null>(null);
  const [state, setState] = useState<VideoState>({ kind: "loading" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active: AbortController | undefined;
    let terminal = false;
    let failures = 0;
    let metadata: PendingVideo | null = null;
    const available = () => navigator.onLine && document.visibilityState !== "hidden";
    const cancel = () => { clearTimeout(timer); active?.abort(); active = undefined; };
    const schedule = (delay: number) => {
      if (!disposed && !terminal && available()) timer = setTimeout(() => void check(), delay * (0.8 + Math.random() * 0.4));
    };
    async function check() {
      if (disposed || terminal || !available() || active) return;
      const controller = new AbortController();
      active = controller;
      const current = () => !disposed && !controller.signal.aborted;
      try {
        // Only an unacknowledged upload needs replay. The durable attempt key
        // makes repeating this exact payload safe even if the first POST landed.
        if (metadata?.requestState === "submitting") {
          const design = await loadDesign(metadata.designId);
          if (!current()) return;
          if (!design) throw new Error("The source Design is unavailable. Restore it on this device to resume this request.");
          await createDevotionalVideo({
            attemptId, artwork: design.artwork, artworkSHA256: design.artworkSHA256,
            dedication: metadata.dedication,
            ...(metadata.recipientName === undefined ? {} : { recipientName: metadata.recipientName }),
            ...(metadata.occasion === undefined ? {} : { occasion: metadata.occasion }),
            localeIdentifier: metadata.localeIdentifier,
          }, { signal: controller.signal });
          if (!current()) return;
          metadata = { ...metadata, requestState: "accepted" };
          await savePendingVideo(metadata).catch(() => undefined);
          if (!current()) return;
          setPending(metadata);
        }
        const snapshot = await fetchVideoAttempt(attemptId, { signal: controller.signal });
        if (!current()) return;
        if (snapshot.kind === "processing") {
          failures = 0;
          setState({ kind: "processing" });
          schedule(Math.min(30, Math.max(3, snapshot.retryAfterSeconds || 3)) * 1000);
        } else if (snapshot.kind === "ready") {
          const movie = await downloadVideo(snapshot.download, { signal: controller.signal });
          if (!current()) return;
          const video: SavedVideo = { attemptId, designId: metadata?.designId ?? "", movie,
            personalizedMessage: snapshot.personalizedMessage, createdAt: new Date().toISOString() };
          terminal = true;
          setState({ kind: "ready", video, storageError: false });
          void requestPersistentStorage();
          try { await saveVideo(video); }
          catch { if (!disposed) setState({ kind: "ready", video, storageError: true }); }
        } else {
          terminal = true;
          await clearPendingVideo(attemptId).catch(() => undefined);
          if (current()) setState({ kind: snapshot.kind, message: snapshot.message, resumable: false });
        }
      } catch (error) {
        if (!current()) return;
        if (error instanceof BackendError && error.status === 404) {
          terminal = true;
          await clearPendingVideo(attemptId).catch(() => undefined);
          if (disposed) return;
          setState({ kind: "failed", message: "This request could not be found. Your saved Design remains available in My creations.", resumable: false });
        } else {
          setState({ kind: "error", message: error instanceof Error ? error.message : "The saved request could not be checked." });
          schedule(Math.min(60_000, 5000 * 2 ** Math.min(failures++, 4)));
        }
      } finally { if (active === controller) active = undefined; }
    }
    const resume = () => { cancel(); if (available()) void check(); };
    setState({ kind: "loading" });
    void loadPendingVideo(attemptId).catch(() => undefined).then(value => {
      if (disposed) return;
      metadata = value?.attemptId === attemptId ? value : null;
      setPending(metadata);
      window.addEventListener("online", resume);
      window.addEventListener("offline", resume);
      document.addEventListener("visibilitychange", resume);
      void check();
    });
    return () => {
      disposed = true; cancel();
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [attemptId, revision]);

  async function retrySave() {
    if (state.kind !== "ready") return;
    try { await saveVideo(state.video); setState({ ...state, storageError: false }); }
    catch { setState({ ...state, storageError: true }); }
  }
  return { pending, state, retry: () => setRevision(value => value + 1), retrySave };
}
