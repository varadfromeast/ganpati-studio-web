import { ArrowLeft, Check, Film, LoaderCircle, LockKeyhole, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { useObjectUrl } from "../hooks/useObjectUrl";
import {
  BackendError,
  createDevotionalVideo,
  fetchEconomy,
  hasBackendConfiguration,
  type GenerationEconomy,
} from "../services/backend";
import { hasCloudConfiguration } from "../services/firebase";
import {
  clearPendingVideo,
  loadDesign,
  savePendingVideo,
  type PendingVideo,
  type SavedDesign,
} from "../services/persistence";

const suggestions = [
  { label: "Joy & peace", message: "May joy and peace fill your home." },
  { label: "For family", message: "May Bappa bless our family with joy and togetherness." },
  { label: "New beginning", message: "May this new beginning bring courage, grace, and happiness." },
];

export function VideoCreatorPage() {
  const [searchParams] = useSearchParams();
  const designId = searchParams.get("design") ?? "";
  const navigate = useNavigate();
  const [design, setDesign] = useState<SavedDesign | null | undefined>(undefined);
  const [economy, setEconomy] = useState<GenerationEconomy | null>(null);
  const [economyMessage, setEconomyMessage] = useState("Checking your video credits…");
  const [dedication, setDedication] = useState("May joy and peace fill our home.");
  const [recipientName, setRecipientName] = useState("");
  const [occasion, setOccasion] = useState("");
  const [locale, setLocale] = useState<"en-IN" | "hi-IN" | "mr-IN">("en-IN");
  const [moreOpen, setMoreOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dedicationRef = useRef<HTMLTextAreaElement>(null);
  const designUrl = useObjectUrl(design?.artwork);
  const cloudConfigured = hasCloudConfiguration() && hasBackendConfiguration();

  useEffect(() => {
    let disposed = false;
    setDesign(undefined);
    void loadDesign(designId)
      .then((value) => { if (!disposed) setDesign(value ?? null); })
      .catch(() => { if (!disposed) setDesign(null); });
    return () => { disposed = true; };
  }, [designId]);

  useEffect(() => {
    if (!cloudConfigured) {
      setEconomyMessage("Cloud video creation is not configured on this deployment.");
      return;
    }
    void fetchEconomy()
      .then((value) => {
        setEconomy(value);
        setEconomyMessage(`${value.credits} video credit${value.credits === 1 ? "" : "s"} available`);
      })
      .catch((fetchError: unknown) => {
        setEconomyMessage(fetchError instanceof Error ? fetchError.message : "Credits could not be checked.");
      });
  }, [cloudConfigured]);

  useEffect(() => {
    if (design && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      dedicationRef.current?.focus();
    }
  }, [design]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!design || submitting || !cloudConfigured) return;
    const normalized = dedication.trim();
    if (!normalized || Array.from(normalized).length > 240) {
      setError("Write a blessing between 1 and 240 characters.");
      return;
    }
    if (recipientName.trim().length > 80 || occasion.trim().length > 100) {
      setError("Recipient and occasion details are too long.");
      return;
    }
    const attemptId = crypto.randomUUID();
    const pendingRequest: PendingVideo = {
      attemptId,
      designId: design.id,
      dedication: normalized,
      ...(recipientName.trim() ? { recipientName: recipientName.trim() } : {}),
      ...(occasion.trim() ? { occasion: occasion.trim() } : {}),
      localeIdentifier: locale,
      requestState: "submitting",
      createdAt: new Date().toISOString(),
    };
    setSubmitting(true);
    setError(null);
    try {
      await savePendingVideo(pendingRequest);
    } catch {
      setSubmitting(false);
      setError("Your browser couldn’t save this request. Free some device storage and try again. No video was started.");
      return;
    }
    try {
      const snapshot = await createDevotionalVideo({
        attemptId,
        artwork: design.artwork,
        artworkSHA256: design.artworkSHA256,
        dedication: normalized,
        ...(recipientName.trim() ? { recipientName: recipientName.trim() } : {}),
        ...(occasion.trim() ? { occasion: occasion.trim() } : {}),
        localeIdentifier: locale,
      });

      if (snapshot.kind === "rejected" || (snapshot.kind === "failed" && !isResumableFailure(snapshot.code))) {
        await clearPendingVideo(attemptId).catch(() => undefined);
        setSubmitting(false);
        setError(snapshot.message);
        return;
      }

      await savePendingVideo({ ...pendingRequest, requestState: "accepted" });
      navigate(`/videos/pending/${attemptId}`);
    } catch (submitError) {
      if (submitError instanceof BackendError && submitError.status >= 400 && submitError.status < 500) {
        await clearPendingVideo(attemptId).catch(() => undefined);
        setSubmitting(false);
        setError(submitError.message);
        return;
      }

      // A lost connection can happen after the backend accepted the idempotent
      // request. Keep the saved attempt and check it instead of minting a new ID.
      navigate(`/videos/pending/${attemptId}`);
    }
  }

  function isResumableFailure(code: string) {
    return code === "generation_temporarily_unavailable"
      || code === "media_processing_failed"
      || code === "provider_submission_unknown";
  }

  if (design === undefined) return <div className="centered-state"><div className="loading-mark" /><p>Preparing your Design…</p></div>;
  if (design === null) {
    return (
      <div className="centered-state">
        <h1>Your source Design is not on this device.</h1>
        <Link className="button button--blue" to="/create/video">Choose a Base Murti</Link>
      </div>
    );
  }

  const noCredits = economy?.credits === 0;

  return (
    <div className="video-create-page page-with-nav page-gutter">
      <header className="subpage-header">
        <Link className="icon-button" to={`/design/${design.id}`} aria-label="Back to finished Design"><ArrowLeft /></Link>
        <Brand compact />
        <span className="result-status"><LockKeyhole /> Private request</span>
      </header>

      <section className="video-create-layout">
        <aside className="video-source">
          <div className="video-source__frame">
            {designUrl && <img src={designUrl} alt={`Source ${design.packTitle} Design`} />}
            <span><Check /> Exact source locked</span>
          </div>
          <div className="video-source__facts">
            <span>6 sec</span><span>Portrait</span><span>Gentle motion</span><span>No spoken words</span>
          </div>
        </aside>

        <form className="blessing-form" onSubmit={(event) => void submit(event)}>
          <div className="blessing-form__title">
            <Film aria-hidden="true" />
            <div><h1>Add your blessing.</h1><p>Your approved message will appear exactly as written.</p></div>
          </div>

          <label className="field-label" htmlFor="dedication">
            <span>Message shown in the video</span>
            <span>{Array.from(dedication).length}/240</span>
          </label>
          <textarea
            ref={dedicationRef}
            id="dedication"
            maxLength={240}
            value={dedication}
            onChange={(event) => setDedication(event.target.value)}
            rows={4}
          />

          <div className="suggestion-row" aria-label="Blessing suggestions">
            {suggestions.map((suggestion) => (
              <button key={suggestion.label} type="button" onClick={() => setDedication(suggestion.message)}>
                {suggestion.label}
              </button>
            ))}
          </div>

          <fieldset className="language-picker">
            <legend>Message language</legend>
            {([
              ["en-IN", "English"],
              ["hi-IN", "हिन्दी"],
              ["mr-IN", "मराठी"],
            ] as const).map(([value, label]) => (
              <label key={value} className={locale === value ? "is-selected" : ""}>
                <input type="radio" name="locale" value={value} checked={locale === value} onChange={() => setLocale(value)} />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <button className="personalize-toggle" type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
            <Sparkles /> {moreOpen ? "Hide extra details" : "Personalize more"}
          </button>
          {moreOpen && (
            <div className="personalize-fields">
              <label>Recipient name <span>optional</span><input value={recipientName} maxLength={80} onChange={(event) => setRecipientName(event.target.value)} /></label>
              <label>Occasion <span>optional</span><input value={occasion} maxLength={100} onChange={(event) => setOccasion(event.target.value)} /></label>
            </div>
          )}

          <div className="credit-line">
            <span>Cost</span>
            <strong>1 video credit</strong>
            <small>{economyMessage}</small>
          </div>
          {noCredits && (
            <div className="inline-notice" role="status">
              Web credit checkout is not configured yet. No video has started and no credit was used.
            </div>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}

          <button className="finish-button" type="submit" disabled={submitting || noCredits || !cloudConfigured}>
            {submitting ? <><LoaderCircle className="spin" /> Saving request safely…</> : "Create video · 1 credit"}
          </button>
          <p className="submit-disclosure">
            Your artwork uploads only after this action. A credit is reserved only after the backend safely accepts this exact request; retries reuse the same attempt identifier.
          </p>
        </form>
      </section>
    </div>
  );
}
