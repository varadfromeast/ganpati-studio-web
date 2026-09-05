import type { AssetPack, EditorHistory, Preset, SelectionMap, SlotId } from "./types";

function copy(selections: SelectionMap): SelectionMap {
  return { ...selections };
}

function equal(left: SelectionMap, right: SelectionMap): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key as SlotId] === right[key as SlotId]);
}

function commit(history: EditorHistory, next: SelectionMap): EditorHistory {
  if (equal(history.present, next)) return history;
  return {
    ...history,
    past: [...history.past, copy(history.present)],
    present: copy(next),
    future: [],
  };
}

export function createEditorHistory(initial: SelectionMap): EditorHistory {
  return { initial: copy(initial), past: [], present: copy(initial), future: [] };
}

export function selectVariant(
  history: EditorHistory,
  pack: AssetPack,
  slot: SlotId,
  variantId: string,
): EditorHistory {
  const allowed = pack.variants.some((variant) => variant.slot === slot && variant.id === variantId);
  if (!pack.slots.includes(slot) || !allowed) throw new Error("That Variant is not available for this Base Murti.");
  return commit(history, { ...history.present, [slot]: variantId });
}

export function applyPreset(history: EditorHistory, pack: AssetPack, preset: Preset): EditorHistory {
  const next = { ...history.present };
  for (const slot of pack.slots) {
    const variantId = preset.selections[slot];
    if (variantId && pack.variants.some((variant) => variant.slot === slot && variant.id === variantId)) {
      next[slot] = variantId;
    }
  }
  return commit(history, next);
}

export function resetEditor(history: EditorHistory): EditorHistory {
  return commit(history, history.initial);
}

export function undoEditor(history: EditorHistory): EditorHistory {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    ...history,
    past: history.past.slice(0, -1),
    present: copy(previous),
    future: [copy(history.present), ...history.future],
  };
}

export function redoEditor(history: EditorHistory): EditorHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    ...history,
    past: [...history.past, copy(history.present)],
    present: copy(next),
    future: history.future.slice(1),
  };
}

export function randomPreset(pack: AssetPack, current: SelectionMap, random = Math.random): Preset {
  const alternatives = pack.presets.filter((preset) => !equal(preset.selections, current));
  const candidates = alternatives.length > 0 ? alternatives : pack.presets;
  if (candidates.length === 0) throw new Error("No curated looks are available for this Base Murti.");
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]!;
}

export function hasChanges(history: EditorHistory): boolean {
  return !equal(history.initial, history.present);
}
