import { ArrowLeft, Cloud, CreditCard, Database, LockKeyhole, Share2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Brand } from "../components/Brand";
import { clearLocalCreations } from "../services/persistence";

const sections = [
  {
    icon: Database,
    title: "Shringar stays in this browser",
    body: "Choosing a Base Murti and trying fitted Variants happens on your device. Your current recipe, finished Designs, personal text and downloaded videos use this browser profile’s local storage. Anyone using the same unlocked browser profile may be able to open them. Browsers can also clear local data, so download anything you want to keep permanently.",
  },
  {
    icon: Cloud,
    title: "AI creation is an explicit upload",
    body: "Only after you ask for AI creation do we send the flattened Design and request details to the private backend and configured generation providers. Provider credentials never enter browser code. Uploaded source images are retained for up to 1 day, generated and provider media for up to 7 days, and private job records for up to 30 days for delivery, abuse prevention and recovery.",
  },
  {
    icon: LockKeyhole,
    title: "Requests are authenticated and resumable",
    body: "Anonymous Firebase sign-in identifies this browser and web App Check helps limit automated abuse. Every accepted video request gets one stable attempt identifier, so a lost connection can resume the same work rather than creating a duplicate paid submission.",
  },
  {
    icon: CreditCard,
    title: "Credits and limits",
    body: "The backend shows available generation credits and reserves one only after a request passes its safety gates. Apple purchases are not offered on the web. Web checkout will remain unavailable until a merchant provider and server-side fulfillment flow are reviewed and configured.",
  },
  {
    icon: Share2,
    title: "Sharing is always your choice",
    body: "Nothing is posted publicly by Ganpati Studio. Share opens only after your action and falls back to a file download when browser sharing is unavailable. A finished video is copied into this browser’s private local library after its integrity check succeeds.",
  },
];

export function PrivacyPage() {
  const [clearState, setClearState] = useState<"idle" | "confirm" | "clearing" | "done" | "error">("idle");

  async function clearBrowserData() {
    if (clearState === "clearing") return;
    setClearState("clearing");
    try {
      await clearLocalCreations();
      setClearState("done");
    } catch {
      setClearState("error");
    }
  }

  return (
    <div className="privacy-page page-with-nav page-gutter">
      <header className="subpage-header">
        <Link className="icon-button" to="/" aria-label="Back to home"><ArrowLeft /></Link>
        <Brand compact />
        <span className="result-status"><ShieldCheck /> Private by default</span>
      </header>

      <div className="privacy-heading">
        <ShieldCheck aria-hidden="true" />
        <h1>Your creation. Your choice.</h1>
        <p>Here is exactly what stays local, what leaves your browser, and when.</p>
      </div>

      <section className="privacy-ledger" aria-label="Privacy and data practices">
        {sections.map(({ icon: Icon, title, body }) => (
          <article key={title}>
            <Icon aria-hidden="true" />
            <div><h2>{title}</h2><p>{body}</p></div>
          </article>
        ))}
      </section>

      <aside className="privacy-callout">
        <LockKeyhole aria-hidden="true" />
        <div><strong>No public gallery. No background upload.</strong><span>Creation is local until you choose an AI action.</span></div>
      </aside>

      <section className="privacy-controls" aria-labelledby="privacy-controls-title">
        <div>
          <h2 id="privacy-controls-title">Clear this browser</h2>
          <p>Remove saved recipes, Designs, pending request shortcuts and downloaded videos from this browser profile.</p>
        </div>
        {clearState === "confirm" ? (
          <div className="privacy-controls__confirmation" role="group" aria-label="Confirm clearing local creations">
            <p>Downloaded files stay on your device. Backend retention already created by an AI request is not shortened by this action.</p>
            <div>
              <button className="destructive-button" type="button" onClick={() => void clearBrowserData()}>Clear local creations</button>
              <button className="button button--paper" type="button" onClick={() => setClearState("idle")}>Keep everything</button>
            </div>
          </div>
        ) : (
          <button
            className="button button--paper"
            type="button"
            onClick={() => setClearState("confirm")}
            disabled={clearState === "clearing"}
          >
            {clearState === "clearing" ? "Clearing…" : "Clear local creations"}
          </button>
        )}
        {clearState === "done" && <p className="inline-notice" role="status">Local creations were removed from this browser.</p>}
        {clearState === "error" && <p className="form-error" role="alert">This browser could not clear the data. Try again after closing other Ganpati Studio tabs.</p>}
      </section>
    </div>
  );
}
