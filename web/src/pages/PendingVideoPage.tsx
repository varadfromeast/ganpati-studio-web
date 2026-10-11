import { ArrowLeft, Check, Download, RefreshCw, Share2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { usePendingVideo } from "../hooks/usePendingVideo";
import { fileFromBlob, shareOrDownload } from "../services/share";

export function PendingVideoPage() {
  const { attemptId = "" } = useParams();
  const { pending, state, retry, retrySave } = usePendingVideo(attemptId);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const videoUrl = useObjectUrl(state.kind === "ready" ? state.video.movie : null);

  async function share() {
    if (state.kind !== "ready") return;
    try {
      const result = await shareOrDownload(
        fileFromBlob(state.video.movie, "ganpati-studio-devotional-video.mp4"),
        "My devotional video",
        state.video.personalizedMessage,
      );
      setShareMessage(result === "shared" ? "Sharing opened." : "Your video was downloaded.");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setShareMessage("Sharing did not open. The video remains in My creations.");
    }
  }

  return (
    <div className="pending-video-page page-with-nav page-gutter">
      <header className="subpage-header">
        <Link className="icon-button" to="/library" aria-label="Back to creations"><ArrowLeft /></Link>
        <Brand compact />
        <span className="result-status">Attempt saved</span>
      </header>

      {state.kind === "loading" && <VideoProgress dedication={pending?.dedication} />}
      {state.kind === "processing" && <VideoProgress dedication={pending?.dedication} />}

      {state.kind === "ready" && videoUrl && (
        <section className="video-ready">
          <div className="video-ready__player"><video src={videoUrl} controls playsInline preload="metadata" /></div>
          <div className="video-ready__copy">
            <span className="success-seal"><Check /></span>
            <h1>Video ready.</h1>
            <blockquote>{state.video.personalizedMessage}</blockquote>
            <p>AI-generated motion · message shown exactly as approved.</p>
            <button className="button button--marigold button--wide" type="button" onClick={() => void share()}>
              <Share2 /> Share or save video
            </button>
            {state.storageError && <div className="inline-notice" role="status">
              We couldn’t save this video on your device. Download it now or try saving again.
              <button className="button button--paper" type="button" onClick={() => void retrySave()}>Try saving again</button>
            </div>}
            {shareMessage && <div className="inline-notice" role="status">{shareMessage}</div>}
            <Link className="text-link" to="/library">See all creations</Link>
          </div>
        </section>
      )}

      {(state.kind === "failed" || state.kind === "rejected") && (
        <section className="centered-state">
          <h1>{state.kind === "rejected" ? "Please adjust your request." : "Creation paused."}</h1>
          <p>{state.message}</p>
          {state.resumable ? (
            <button className="button button--blue" type="button" onClick={() => retry()}><RefreshCw /> Resume same request</button>
          ) : (
            <Link className="button button--blue" to={pending ? `/video/new?design=${pending.designId}` : "/create/video"}>Edit request</Link>
          )}
        </section>
      )}

      {state.kind === "error" && (
        <section className="centered-state">
          <h1>We couldn’t check the saved request.</h1>
          <p>{state.message}</p>
          <button className="button button--blue" type="button" onClick={() => retry()}><RefreshCw /> Try again</button>
        </section>
      )}
    </div>
  );
}

function VideoProgress({ dedication }: { dedication: string | undefined }) {
  return (
    <section className="video-progress" aria-live="polite">
      <div className="video-progress__visual" aria-hidden="true">
        <span /><span /><span />
        <Sparkles />
      </div>
      <h1>Creating your devotional video…</h1>
      {dedication && <blockquote>{dedication}</blockquote>}
      <p>
        This same request was saved before upload. You can safely leave and continue it from My creations without spending a second credit.
      </p>
      <Link className="button button--paper" to="/library"><Download /> Leave safely</Link>
    </section>
  );
}
