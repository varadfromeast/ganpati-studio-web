import { ArrowRight, Film, Images, Play, Share2, Trash2, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { useObjectUrl } from "../hooks/useObjectUrl";
import {
  listDesigns,
  listVideos,
  loadPendingVideo,
  removeVideo,
  type PendingVideo,
  type SavedDesign,
  type SavedVideo,
} from "../services/persistence";
import { fileFromBlob, shareOrDownload } from "../services/share";

export function LibraryPage() {
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [pending, setPending] = useState<PendingVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [savedDesigns, savedVideos, pendingVideo] = await Promise.all([
        listDesigns(),
        listVideos(),
        loadPendingVideo(),
      ]);
      setDesigns(savedDesigns);
      setVideos(savedVideos);
      setPending(pendingVideo ?? null);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  async function deleteVideo(attemptId: string): Promise<boolean> {
    try {
      await removeVideo(attemptId);
      setVideos((current) => current.filter((video) => video.attemptId !== attemptId));
      setLibraryMessage("Video removed from this browser.");
      return true;
    } catch {
      setLibraryMessage("The video could not be removed. It remains in this browser.");
      return false;
    }
  }

  return (
    <div className="library-page page-with-nav page-gutter">
      <header className="library-header">
        <Brand />
        <div><h1>My creations.</h1><p>Saved in this browser, ready to download or share.</p></div>
      </header>

      {pending && (
        <Link className="library-pending" to={`/videos/pending/${pending.attemptId}`}>
          <span className="pending-banner__pulse" aria-hidden="true" />
          <div>
            <strong>{pending.requestState === "submitting" ? "Video request saved" : "Video in progress"}</strong>
            <span>{pending.dedication}</span>
          </div>
          <span>{pending.requestState === "submitting" ? "Check request" : "Resume safely"} <ArrowRight /></span>
        </Link>
      )}

      {libraryMessage && <div className="inline-notice library-message" role="status">{libraryMessage}</div>}

      {loading ? (
        <div className="library-loading" aria-live="polite"><div className="loading-mark" /> Opening your creations…</div>
      ) : loadError ? (
        <div className="centered-state" role="alert">
          <h2>Your creations could not be opened.</h2>
          <p>This browser may have blocked local storage. Your downloaded files are unaffected.</p>
          <button className="button button--blue" type="button" onClick={() => void loadLibrary()}>Try again</button>
        </div>
      ) : (
        <>
          <section className="library-section" aria-labelledby="designs-title">
            <div className="section-heading">
              <div><Images /><h2 id="designs-title">Bappa Designs</h2><span>{designs.length}</span></div>
              <Link to="/create/design">Create another <WandSparkles /></Link>
            </div>
            {designs.length > 0 ? (
              <div className="creation-grid creation-grid--designs">
                {designs.map((design) => <DesignCard key={design.id} design={design} />)}
              </div>
            ) : (
              <EmptyState
                icon={<WandSparkles />}
                title="No Designs yet"
                body="Choose a Base Murti, explore its fitted shringar, then finish your first Design."
                to="/create/design"
                action="Create a Bappa Design"
              />
            )}
          </section>

          <section className="library-section" aria-labelledby="videos-title">
            <div className="section-heading">
              <div><Film /><h2 id="videos-title">Devotional videos</h2><span>{videos.length}</span></div>
              <Link to="/create/video">Make a video <Film /></Link>
            </div>
            {videos.length > 0 ? (
              <div className="creation-grid creation-grid--videos">
                {videos.map((video) => (
                  <VideoCard key={video.attemptId} video={video} onDelete={() => deleteVideo(video.attemptId)} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Film />}
                title="No videos yet"
                body="Dress your Bappa, review the exact Design, then add a personal blessing."
                to="/create/video"
                action="Create a devotional video"
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function DesignCard({ design }: { design: SavedDesign }) {
  const url = useObjectUrl(design.artwork);
  return (
    <article className="design-card">
      <Link to={`/design/${design.id}`} className="design-card__image">
        {url && <img src={url} alt={`${design.packTitle} Ganpati Design`} />}
        <span>Open Design <ArrowRight /></span>
      </Link>
      <div><strong>{design.packTitle}</strong><time dateTime={design.createdAt}>{formatDate(design.createdAt)}</time></div>
    </article>
  );
}

function VideoCard({ video, onDelete }: { video: SavedVideo; onDelete: () => Promise<boolean> }) {
  const url = useObjectUrl(video.movie);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function share() {
    try {
      await shareOrDownload(
        fileFromBlob(video.movie, "ganpati-studio-devotional-video.mp4"),
        "My devotional video",
        video.personalizedMessage,
      );
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setMessage("Sharing did not open.");
    }
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    const removed = await onDelete();
    if (!removed) {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <article className="video-card">
      <div className="video-card__player">
        {url && <video src={url} controls playsInline preload="metadata" aria-label="Saved devotional video" />}
        <span aria-hidden="true"><Play /></span>
      </div>
      <blockquote>{video.personalizedMessage}</blockquote>
      <time dateTime={video.createdAt}>{formatDate(video.createdAt)}</time>
      {confirmingDelete ? (
        <div className="video-card__delete-confirmation" role="group" aria-label="Confirm video removal">
          <p>Remove this saved video from this browser?</p>
          <div>
            <button type="button" className="destructive-button" onClick={() => void confirmDelete()} disabled={deleting}>
              <Trash2 aria-hidden="true" /> {deleting ? "Removing…" : "Remove video"}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Keep it</button>
          </div>
        </div>
      ) : (
        <div className="video-card__actions">
          <button type="button" onClick={() => void share()}><Share2 aria-hidden="true" /> Share video</button>
          <button type="button" onClick={() => setConfirmingDelete(true)} aria-label="Remove video from this browser"><Trash2 aria-hidden="true" /></button>
        </div>
      )}
      {message && <small role="status">{message}</small>}
    </article>
  );
}

function EmptyState({ icon, title, body, to, action }: { icon: React.ReactNode; title: string; body: string; to: string; action: string }) {
  return (
    <div className="library-empty">
      <span>{icon}</span><div><h3>{title}</h3><p>{body}</p></div><Link to={to}>{action} <ArrowRight /></Link>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
