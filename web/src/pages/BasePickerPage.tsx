import { ArrowLeft, ArrowRight, Film, WandSparkles } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { PACK_DEFINITIONS, packThumbnailUrl } from "../domain/assetPack";

export function BasePickerPage() {
  const { intent } = useParams();
  if (intent !== "design" && intent !== "video") return <Navigate to="/create/design" replace />;
  const IntentIcon = intent === "video" ? Film : WandSparkles;

  return (
    <div className="picker-page page-with-nav page-gutter">
      <header className="subpage-header">
        <Link className="icon-button" to="/" aria-label="Back to home"><ArrowLeft /></Link>
        <Brand compact />
        <div className="intent-badge"><IntentIcon size={17} /> {intent === "video" ? "Video journey" : "Design journey"}</div>
      </header>

      <div className="picker-heading">
        <h1>Choose your Bappa.</h1>
        <p>Each Base Murti keeps its own fitted decorations and saved Design.</p>
      </div>

      <section className="murti-grid" aria-label="Available Base Murtis">
        {PACK_DEFINITIONS.map((pack, index) => (
          <Link
            key={pack.slug}
            className={`murti-choice murti-choice--${pack.slug}`}
            to={`/studio/${pack.slug}?intent=${intent}`}
          >
            <div className="murti-choice__image">
              <img
                src={packThumbnailUrl(pack.slug)}
                alt=""
                loading={index === 0 ? "eager" : "lazy"}
                width="600"
                height="1067"
              />
              <span className="murti-choice__index" aria-hidden="true">0{index + 1}</span>
            </div>
            <div className="murti-choice__copy">
              <h2>{pack.title}</h2>
              <p>{pack.description}</p>
              <span className="murti-choice__status">Base Murti · Ready to dress</span>
              <span className="murti-choice__action">
                Choose {pack.title} <ArrowRight aria-hidden="true" />
              </span>
            </div>
          </Link>
        ))}
      </section>

    </div>
  );
}
