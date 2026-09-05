import {
  ArrowLeft,
  Check,
  Download,
  Film,
  Pencil,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { useObjectUrl } from "../hooks/useObjectUrl";
import { createEnhancedStill, sha256 } from "../services/backend";
import { loadDesign, saveDesign, type SavedDesign } from "../services/persistence";
import { fileFromBlob, shareOrDownload } from "../services/share";

const fidelityChecks = [
  "Face and expression",
  "Trunk path",
  "Hands, mudras and modak",
  "Selected crown",
  "Garment palette",
  "Overall framing",
];

type EnhancementState =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "review"; blob: Blob }
  | { kind: "approved"; blob: Blob; savedId: string }
  | { kind: "error"; message: string };

export function DesignPage() {
  const { designId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const intent = searchParams.get("intent") === "video" ? "video" : "design";
  const [design, setDesign] = useState<SavedDesign | null | undefined>(undefined);
  const [enhancement, setEnhancement] = useState<EnhancementState>({ kind: "idle" });
  const [enhanceOpen, setEnhanceOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const enhanceTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const designUrl = useObjectUrl(design?.artwork);
  const enhancedStillsEnabled = import.meta.env.VITE_ENABLE_ENHANCED_STILLS === "true";
  const enhancedBlob = enhancement.kind === "review" || enhancement.kind === "approved"
    ? enhancement.blob
    : null;
  const enhancedUrl = useObjectUrl(enhancedBlob);

  useEffect(() => {
    void loadDesign(designId)
      .then((value) => setDesign(value ?? null))
      .catch(() => setDesign(null));
  }, [designId]);

  useEffect(() => {
    if (!enhanceOpen) return;
    document.body.classList.add("dialog-open");
    const frame = window.requestAnimationFrame(() => {
      sheetRef.current?.querySelector<HTMLElement>("button:not(:disabled), [href], input, textarea, select")?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setEnhanceOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
      )].filter((element) => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("dialog-open");
      enhanceTriggerRef.current?.focus();
    };
  }, [enhanceOpen]);

  async function share(blob: Blob, suffix = "design") {
    try {
      const result = await shareOrDownload(
        fileFromBlob(blob, `ganpati-studio-${suffix}.png`),
        "My Ganpati Studio Design",
        "Created with care in Ganpati Studio.",
      );
      setMessage(result === "shared" ? "Sharing opened." : "Your PNG was downloaded.");
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setMessage("Sharing did not open. Your Design is still safe here.");
      }
    }
  }

  async function enhance() {
    if (!design) return;
    setEnhancement({ kind: "generating" });
    try {
      const blob = await createEnhancedStill({
        source: design.artwork,
        sourceCompositionHash: design.artworkSHA256,
        prompt: "Create a polished devotional still while preserving the exact supplied Base Murti, expression, posture, selected shringar, colours, offering and framing.",
        invariants: fidelityChecks,
      });
      setEnhancement({ kind: "review", blob });
    } catch (error) {
      setEnhancement({
        kind: "error",
        message: error instanceof Error ? error.message : "Enhanced artwork is temporarily unavailable.",
      });
    }
  }

  async function approveEnhanced(blob: Blob) {
    if (!design) return;
    const savedId = crypto.randomUUID();
    await saveDesign({
      ...design,
      id: savedId,
      artwork: blob,
      artworkSHA256: await sha256(blob),
      createdAt: new Date().toISOString(),
    });
    setEnhancement({ kind: "approved", blob, savedId });
  }

  if (design === undefined) {
    return <div className="centered-state"><div className="loading-mark" /><p>Opening your Design…</p></div>;
  }
  if (design === null) {
    return (
      <div className="centered-state">
        <h1>This Design is not on this device.</h1>
        <p>Browser storage may have been cleared, or the link belongs to another browser.</p>
        <Link className="button button--blue" to="/create/design">Create a new Design</Link>
      </div>
    );
  }

  return (
    <div className="result-page page-with-nav page-gutter">
      <header className="subpage-header result-header">
        <Link className="icon-button" to={`/studio/${design.packId}?intent=${intent}`} aria-label="Keep editing">
          <ArrowLeft />
        </Link>
        <Brand compact />
        <span className="result-status"><Check /> Design saved on this device</span>
      </header>

      <section className="result-layout">
        <div className="result-artwork">
          <div className="result-artwork__label"><span>Finished Design</span><strong>{design.packTitle}</strong></div>
          {designUrl && <img src={designUrl} alt={`Finished ${design.packTitle} Ganpati Design`} />}
        </div>
        <div className="result-actions">
          <h1>Your Bappa is ready.</h1>
          <p>This exact artwork is ready to share or bring gently to life.</p>

          <button className="action-plaque action-plaque--primary" type="button" onClick={() => navigate(`/video/new?design=${design.id}`)}>
            <span className="action-plaque__icon"><Film /></span>
            <span><strong>Create devotional video</strong><small>Add a personal blessing · 6 seconds</small></span>
          </button>
          <button className="action-plaque action-plaque--paper" type="button" onClick={() => void share(design.artwork)}>
            <span className="action-plaque__icon"><Share2 /></span>
            <span><strong>Share or save image</strong><small>Uses sharing when available, with download fallback</small></span>
          </button>

          <div className="result-secondary-actions">
            <Link to={`/studio/${design.packId}?intent=${intent}`}><Pencil /> Keep editing</Link>
            <button
              ref={enhanceTriggerRef}
              type="button"
              onClick={() => setEnhanceOpen(true)}
              disabled={!enhancedStillsEnabled}
              title={enhancedStillsEnabled ? "Create enhanced artwork" : "Available after the production generation guard is enabled"}
            ><Sparkles /> {enhancedStillsEnabled ? "Enhance artwork" : "Enhancement soon"}</button>
          </div>
          {message && <div className="inline-notice" role="status">{message}</div>}
          <p className="local-storage-note">
            Saved in this browser. Download anything you want to keep permanently.
          </p>
        </div>
      </section>

      {enhanceOpen && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setEnhanceOpen(false);
        }}>
          <section
            ref={sheetRef}
            className="creation-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="enhance-title"
            aria-describedby="enhance-description"
          >
            <button className="sheet-close" type="button" onClick={() => setEnhanceOpen(false)} aria-label="Close enhancement">
              <X />
            </button>
            <div className="creation-sheet__heading">
              <Sparkles aria-hidden="true" />
              <div><h2 id="enhance-title">Create final artwork</h2><p id="enhance-description">Your exact Design becomes the source.</p></div>
            </div>

            {enhancement.kind === "idle" && (
              <>
                <div className="enhance-preview">{designUrl && <img src={designUrl} alt="Source Design" />}</div>
                <p>Your face, trunk, hands, selected shringar, colours and framing are locked into the request.</p>
                <button className="button button--marigold button--wide" type="button" onClick={() => void enhance()}>
                  <Sparkles /> Generate enhanced still
                </button>
                <p className="sheet-footnote">This uses the configured image-generation service and may incur usage charges.</p>
              </>
            )}

            {enhancement.kind === "generating" && (
              <div className="generation-progress" aria-live="polite">
                <div className="generation-progress__orbit"><Sparkles /></div>
                <h3>Creating the enhanced still…</h3>
                <p>You can close this sheet. Your original Design is safe.</p>
              </div>
            )}

            {enhancement.kind === "review" && enhancedUrl && (
              <>
                <div className="enhance-compare">
                  <figure>{designUrl && <img src={designUrl} alt="Original Design" />}<figcaption>Original</figcaption></figure>
                  <figure><img src={enhancedUrl} alt="Enhanced artwork for review" /><figcaption>Enhanced</figcaption></figure>
                </div>
                <h3>Does the result preserve every choice?</h3>
                <ul className="fidelity-list">{fidelityChecks.map((check) => <li key={check}><Check /> {check}</li>)}</ul>
                <div className="sheet-actions">
                  <button className="button button--blue" type="button" onClick={() => void approveEnhanced(enhancement.blob)}><Check /> Approve and save</button>
                  <button className="button button--paper" type="button" onClick={() => void enhance()}><RefreshCw /> Needs another pass</button>
                </div>
              </>
            )}

            {enhancement.kind === "approved" && enhancedUrl && (
              <div className="generation-ready">
                <img src={enhancedUrl} alt="Approved enhanced Ganpati artwork" />
                <h3>Enhanced artwork ready.</h3>
                <button className="button button--marigold button--wide" type="button" onClick={() => void share(enhancement.blob, "enhanced")}>
                  <Download /> Share or save enhanced image
                </button>
              </div>
            )}

            {enhancement.kind === "error" && (
              <div className="generation-error" role="alert">
                <h3>Enhancement is unavailable.</h3>
                <p>{enhancement.message}</p>
                <button className="button button--blue" type="button" onClick={() => void enhance()}><RefreshCw /> Retry</button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
