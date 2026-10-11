import {
  ArrowRight,
  Film,
  Images,
  Play,
  ShieldCheck,
  Paintbrush,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { loadPendingVideo, type PendingVideo } from "../services/persistence";

export function HomePage() {
  const [pending, setPending] = useState<PendingVideo | null>(null);

  useEffect(() => {
    void loadPendingVideo()
      .then((value) => setPending(value ?? null))
      .catch(() => setPending(null));
  }, []);

  return (
    <div className="home-page page-with-nav">
      <header className="home-header page-gutter">
        <Brand />
        <div className="home-header__actions">
          <Link className="quiet-link" to="/library">
            <Images aria-hidden="true" size={18} /> My creations
          </Link>
          <Link className="quiet-link" to="/privacy">
            <ShieldCheck aria-hidden="true" size={18} /> Private by design
          </Link>
        </div>
      </header>

      {pending && (
        <section className="pending-banner page-gutter" aria-label="Video in progress">
          <div className="pending-banner__pulse" aria-hidden="true" />
          <div>
            <strong>{pending.requestState === "submitting" ? "Your video request is saved." : "Your devotional video is still safe."}</strong>
            <span>{pending.requestState === "submitting"
              ? "Check this same request before starting another."
              : "Continue the same accepted request without starting another."}</span>
          </div>
          <Link to={`/videos/pending/${pending.attemptId}`}>
            Continue <ArrowRight aria-hidden="true" size={18} />
          </Link>
        </section>
      )}

      <section className="home-hero page-gutter">
        <div className="home-hero__story">
          <h1>Your Bappa, dressed for your celebration.</h1>
          <p className="home-hero__intro">
            Choose a Base Murti, explore shringar made to fit it exactly, and keep every
            detail ready to share—or bring gently to life.
          </p>
          <p className="festival-note">Ganesh Chaturthi · Create with care</p>

          <div className="creation-actions" aria-label="Start creating">
            <Link className="action-plaque action-plaque--primary" to="/create/design">
              <span className="action-plaque__icon"><Paintbrush aria-hidden="true" /></span>
              <span>
                <strong>Create a Bappa Design</strong>
                <small>Dress, save and share your own artwork</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="action-plaque action-plaque--secondary" to="/create/video">
              <span className="action-plaque__icon"><Film aria-hidden="true" /></span>
              <span>
                <strong>Make a devotional video</strong>
                <small>Design first, then add your personal blessing</small>
              </span>
              <Play aria-hidden="true" />
            </Link>
          </div>

          <p className="home-privacy-note">Your Designs stay on this device. Share them when you’re ready.</p>
        </div>

        <div className="home-stage" aria-label="Ganpati Studio preview">
          <div className="home-stage__arch">
            <img
              src="/previews/seated.webp"
              alt="Bal Ganesha seated in a warm home shrine"
              fetchPriority="high"
              width="600"
              height="1067"
            />
          </div>
        </div>
      </section>

      <section className="home-promise page-gutter" aria-labelledby="promise-title">
        <div>
          <h2 id="promise-title">Every detail, made to fit.</h2>
          <p>
            Each crown, mala, outfit and scene—and every available offering—is fitted to one immutable Base Murti.
            Undo freely. Your choices remain exact.
          </p>
        </div>
        <Link className="text-link" to="/create/design">
          Choose your Base Murti <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </section>
    </div>
  );
}
