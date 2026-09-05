import {
  ArrowLeft,
  Check,
  ChevronDown,
  Redo2,
  RotateCcw,
  Shuffle,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Brand } from "../components/Brand";
import { SlotIcon, slotLabels } from "../components/SlotIcon";
import { loadAssetPack, variantsFor } from "../domain/assetPack";
import { canvasPNG, drawComposition } from "../domain/compositor";
import {
  applyPreset,
  createEditorHistory,
  randomPreset,
  redoEditor,
  resetEditor,
  selectVariant,
  undoEditor,
} from "../domain/editorSession";
import type { AssetPack, EditorHistory, SlotId } from "../domain/types";
import { sha256 } from "../services/backend";
import { loadRecipe, requestPersistentStorage, saveDesign, saveRecipe } from "../services/persistence";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; pack: AssetPack; history: EditorHistory };

export function StudioPage() {
  const { packSlug = "" } = useParams();
  const [searchParams] = useSearchParams();
  const intent = searchParams.get("intent") === "video" ? "video" : "design";
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRun = useRef(0);
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [activeSlot, setActiveSlot] = useState<SlotId>("crown");
  const [canvasStatus, setCanvasStatus] = useState("Preparing artwork…");
  const [stageRevealed, setStageRevealed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ kind: "loading" });
    setStageRevealed(false);
    void loadAssetPack(packSlug, controller.signal)
      .then(async (pack) => {
        const restored = await loadRecipe(pack.slug);
        const validRestored = restored
          && pack.slots.every((slot) => pack.variants.some(
            (variant) => variant.slot === slot && variant.id === restored.selections[slot],
          ));
        const initial = validRestored ? restored.selections : pack.defaultSelections;
        setActiveSlot(pack.slots[0] ?? "crown");
        setLoadState({ kind: "ready", pack, history: createEditorHistory(initial) });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState({
          kind: "error",
          message: error instanceof Error ? error.message : "The Base Murti could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [packSlug]);

  const ready = loadState.kind === "ready" ? loadState : null;
  const activeVariants = useMemo(
    () => ready ? variantsFor(ready.pack, activeSlot) : [],
    [ready, activeSlot],
  );
  const activeVariant = ready?.pack.variants.find(
    (variant) => variant.slot === activeSlot && variant.id === ready.history.present[activeSlot],
  );

  useEffect(() => {
    if (!ready || !canvasRef.current) return;
    const run = ++renderRun.current;
    setCanvasStatus("Composing your Design…");
    void drawComposition(canvasRef.current, ready.pack, ready.history.present)
      .then(() => {
        if (run === renderRun.current) {
          setCanvasStatus("Design preview ready");
          setStageRevealed(true);
        }
      })
      .catch((error: unknown) => {
        if (run === renderRun.current) {
          setCanvasStatus("Artwork unavailable");
          setNotice(error instanceof Error ? error.message : "One artwork layer could not be shown.");
        }
      });
    void saveRecipe({
      packId: ready.pack.slug,
      selections: { ...ready.history.present },
      updatedAt: new Date().toISOString(),
    }).catch(() => setNotice("This Design could not be saved on this device."));
  }, [ready?.history.present, ready?.pack]);

  function updateHistory(update: (history: EditorHistory, pack: AssetPack) => EditorHistory) {
    setLoadState((current) => current.kind === "ready"
      ? { ...current, history: update(current.history, current.pack) }
      : current);
  }

  function chooseVariant(slot: SlotId, variantId: string) {
    try {
      updateHistory((history, pack) => selectVariant(history, pack, slot, variantId));
      setNotice(null);
      if (navigator.vibrate) navigator.vibrate(8);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That change is unavailable.");
    }
  }

  function surprise() {
    if (!ready) return;
    try {
      const preset = randomPreset(ready.pack, ready.history.present);
      updateHistory((history, pack) => applyPreset(history, pack, preset));
      setNotice(`${preset.title} is ready to explore.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No curated look is available.");
    }
  }

  async function finishDesign() {
    if (!ready || exporting) return;
    setExporting(true);
    setNotice(null);
    try {
      const exportCanvas = document.createElement("canvas");
      await drawComposition(exportCanvas, ready.pack, ready.history.present, 2);
      const artwork = await canvasPNG(exportCanvas);
      const artworkSHA256 = await sha256(artwork);
      const id = crypto.randomUUID();
      await saveDesign({
        id,
        packId: ready.pack.slug,
        packTitle: ready.pack.title,
        selections: { ...ready.history.present },
        artwork,
        artworkSHA256,
        createdAt: new Date().toISOString(),
      });
      void requestPersistentStorage();
      navigate(`/design/${id}?intent=${intent}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This Design could not be finished.");
      setExporting(false);
    }
  }

  if (loadState.kind === "loading") return <StudioLoading />;
  if (loadState.kind === "error") {
    return (
      <div className="centered-state centered-state--on-blue">
        <Brand />
        <h1>Artwork unavailable.</h1>
        <p>{loadState.message}</p>
        <Link className="button button--marigold" to={`/create/${intent}`}>Choose another Base Murti</Link>
      </div>
    );
  }

  const { pack, history } = loadState;
  const selectedId = history.present[activeSlot];

  return (
    <div className="studio-page">
      <header className="studio-header">
        <Link className="icon-button icon-button--blue" to={`/create/${intent}`} aria-label="Back to Base Murti selection">
          <ArrowLeft />
        </Link>
        <Brand compact />
        <div className="studio-progress" aria-label="Step 2 of 3, Shringar">
          <span>2 of 3</span><strong>Shringar</strong>
        </div>
        <div className="studio-header__tools">
          <button
            className="tool-button"
            type="button"
            onClick={() => updateHistory((current) => undoEditor(current))}
            disabled={history.past.length === 0}
          ><Undo2 /><span>Undo</span></button>
          <button
            className="tool-button"
            type="button"
            onClick={() => updateHistory((current) => redoEditor(current))}
            disabled={history.future.length === 0}
          ><Redo2 /><span>Redo</span></button>
        </div>
      </header>

      <div className="studio-workspace">
        <section className="canvas-column" aria-label="Live Design preview">
          <Link
            className="base-switcher"
            to={`/create/${intent}`}
            aria-label={`Change Base Murti, current selection ${pack.title}`}
          >
            <span>Base Murti</span>
            <strong>{pack.title}</strong>
            <ChevronDown aria-hidden="true" size={17} />
          </Link>
          <div className={stageRevealed ? "canvas-frame is-revealed" : "canvas-frame"}>
            <div className="canvas-frame__ticks" aria-hidden="true"><span /><span /><span /><span /></div>
            <canvas ref={canvasRef} aria-label={pack.accessibilityDescription} role="img" />
            <div className="canvas-utilities">
              <button
                type="button"
                onClick={() => updateHistory((current) => undoEditor(current))}
                disabled={history.past.length === 0}
              ><Undo2 /><span>Undo</span></button>
              <button
                type="button"
                onClick={() => updateHistory((current) => redoEditor(current))}
                disabled={history.future.length === 0}
              ><Redo2 /><span>Redo</span></button>
              <button type="button" onClick={() => updateHistory((current) => resetEditor(current))}>
                <RotateCcw /><span>Reset</span>
              </button>
            </div>
          </div>
          <p className="sr-only" aria-live="polite">{canvasStatus}</p>
        </section>

        <aside className={`slot-rail slot-rail--${pack.slots.length}`} aria-label="Customization Slots">
          <div className="slot-rail__label">Shringar</div>
          {pack.slots.map((slot) => (
            <button
              key={slot}
              type="button"
              className={activeSlot === slot ? "slot-tab is-active" : "slot-tab"}
              aria-pressed={activeSlot === slot}
              onClick={() => setActiveSlot(slot)}
            >
              <SlotIcon slot={slot} />
              <span>{slotLabels[slot]}</span>
              <i aria-hidden="true" />
            </button>
          ))}
        </aside>

        <section className="variant-inspector" aria-labelledby="variant-heading">
          <div className="variant-inspector__heading">
            <div>
              <h1 id="variant-heading">{slotLabels[activeSlot]}</h1>
              <p>{activeVariant?.meaning ?? "Choose a fitted Variant for this Design."}</p>
            </div>
            <button className="surprise-button" type="button" onClick={surprise}>
              <Shuffle aria-hidden="true" /> Surprise me
            </button>
          </div>

          <ul className="variant-grid" aria-label={`${slotLabels[activeSlot]} Variants`}>
            {activeVariants.map((variant) => {
              const selected = variant.id === selectedId;
              return (
                <li key={variant.id}>
                  <button
                    type="button"
                    className={selected ? "variant-tile is-selected" : "variant-tile"}
                    aria-pressed={selected}
                    onClick={() => chooseVariant(activeSlot, variant.id)}
                  >
                    <span className="variant-tile__image">
                      <img src={variant.thumbnailUrl} alt="" loading="lazy" />
                      {selected && <span className="variant-check"><Check aria-hidden="true" /></span>}
                    </span>
                    <strong>{variant.title}</strong>
                    {variant.reviewStatus === "preview" && <small>Preview pack</small>}
                  </button>
                </li>
              );
            })}
          </ul>

          {notice && <div className="inline-notice" role="status">{notice}</div>}

          <div className="finish-dock">
            <button className="finish-button" type="button" onClick={() => void finishDesign()} disabled={exporting}>
              <span>{exporting ? "Preparing your exact Design…" : intent === "video" ? "Use this Bappa" : "My Bappa is ready"}</span>
              {!exporting && <Check aria-hidden="true" />}
            </button>
            <p className="finish-caption">Freezes this exact Design in a high-resolution PNG.</p>
          </div>
        </section>
      </div>
    </div>
  );
}

function StudioLoading() {
  return (
    <div className="studio-loading" aria-live="polite">
      <Brand compact />
      <div className="studio-loading__art" />
      <div className="studio-loading__bar" />
      <p>Opening your shringar studio…</p>
    </div>
  );
}
