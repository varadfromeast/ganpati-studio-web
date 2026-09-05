import { describe, expect, it } from "vitest";
import {
  applyPreset,
  createEditorHistory,
  randomPreset,
  redoEditor,
  resetEditor,
  selectVariant,
  undoEditor,
} from "./editorSession";
import type { AssetPack } from "./types";

const pack = {
  slots: ["crown"],
  variants: [
    { id: "crown.a", slot: "crown" },
    { id: "crown.b", slot: "crown" },
  ],
  presets: [
    { id: "a", title: "A", selections: { crown: "crown.a" } },
    { id: "b", title: "B", selections: { crown: "crown.b" } },
  ],
} as unknown as AssetPack;

describe("editor history", () => {
  it("selects, undoes, and redoes without mutating prior state", () => {
    const initial = createEditorHistory({ crown: "crown.a" });
    const changed = selectVariant(initial, pack, "crown", "crown.b");
    expect(initial.present.crown).toBe("crown.a");
    expect(undoEditor(changed).present.crown).toBe("crown.a");
    expect(redoEditor(undoEditor(changed)).present.crown).toBe("crown.b");
  });

  it("resets through normal undo history", () => {
    const changed = selectVariant(createEditorHistory({ crown: "crown.a" }), pack, "crown", "crown.b");
    const reset = resetEditor(changed);
    expect(reset.present.crown).toBe("crown.a");
    expect(undoEditor(reset).present.crown).toBe("crown.b");
  });

  it("applies only variants compatible with the pack", () => {
    const history = createEditorHistory({ crown: "crown.a" });
    const changed = applyPreset(history, pack, { id: "x", title: "X", selections: { crown: "missing" } });
    expect(changed).toBe(history);
    expect(() => selectVariant(history, pack, "crown", "missing")).toThrow(/not available/u);
  });

  it("does not pick the current preset when another exists", () => {
    expect(randomPreset(pack, { crown: "crown.a" }, () => 0).id).toBe("b");
  });
});
