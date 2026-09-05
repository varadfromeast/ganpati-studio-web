import { afterEach, describe, expect, it, vi } from "vitest";
import { compositionPlan, drawComposition } from "./compositor";
import type { AssetPack } from "./types";

const pack = {
  slots: ["crown"],
  fixedLayerAssetIds: ["base", "front"],
  variants: [{ id: "crown.royal", slot: "crown", layerAssetIds: ["crown"] }],
  layers: [
    { assetId: "crown", zIndex: 850 },
    { assetId: "front", zIndex: 710 },
    { assetId: "base", zIndex: 0 },
  ],
} as unknown as AssetPack;

describe("compositionPlan", () => {
  it("combines fixed and selected layers in deterministic z order", () => {
    expect(compositionPlan(pack, { crown: "crown.royal" }).map((layer) => layer.assetId))
      .toEqual(["base", "front", "crown"]);
  });

  it("fails instead of silently rendering an incomplete recipe", () => {
    expect(() => compositionPlan(pack, {})).toThrow(/valid crown/u);
  });
});

describe("drawComposition", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never lets an older asynchronous render overwrite the newest selection", async () => {
    const pending = new Map<string, ControlledImage>();
    vi.stubGlobal("Image", controlledImageClass(pending));
    const drawImage = vi.fn();
    const canvas = testCanvas(drawImage);
    const renderPack = compositionTestPack("race");

    const older = drawComposition(canvas, renderPack, { crown: "slow" });
    const newer = drawComposition(canvas, renderPack, { crown: "fast" });

    pending.get("/race-fast.png")?.succeed();
    await newer;
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect((drawImage.mock.calls[0]?.[0] as ControlledImage).src).toBe("/race-fast.png");

    pending.get("/race-slow.png")?.succeed();
    await older;
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("retries an image after a transient load failure", async () => {
    const pending = new Map<string, ControlledImage>();
    vi.stubGlobal("Image", controlledImageClass(pending));
    const canvas = testCanvas(vi.fn());
    const renderPack = compositionTestPack("retry");

    const first = drawComposition(canvas, renderPack, { crown: "slow" });
    pending.get("/retry-slow.png")?.fail();
    await expect(first).rejects.toThrow(/could not be loaded/u);

    const second = drawComposition(canvas, renderPack, { crown: "slow" });
    pending.get("/retry-slow.png")?.succeed();
    await expect(second).resolves.toBeUndefined();
  });
});

class ControlledImage {
  decoding = "auto";
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private value = "";

  constructor(private readonly pending: Map<string, ControlledImage>) {}

  get src() {
    return this.value;
  }

  set src(value: string) {
    this.value = value;
    this.pending.set(value, this);
  }

  succeed() {
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }
}

function controlledImageClass(pending: Map<string, ControlledImage>) {
  return class extends ControlledImage {
    constructor() {
      super(pending);
    }
  };
}

function testCanvas(drawImage: ReturnType<typeof vi.fn>): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "getContext", {
    value: () => ({
      clearRect: vi.fn(),
      drawImage,
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
    }),
  });
  return canvas;
}

function compositionTestPack(prefix: string): AssetPack {
  return {
    slots: ["crown"],
    fixedLayerAssetIds: [],
    variants: [
      { id: "slow", slot: "crown", layerAssetIds: ["slow-layer"] },
      { id: "fast", slot: "crown", layerAssetIds: ["fast-layer"] },
    ],
    layers: [
      {
        assetId: "slow-layer",
        url: `/${prefix}-slow.png`,
        frame: { x: 0, y: 0, width: 10, height: 10 },
        zIndex: 0,
        blendMode: "normal",
      },
      {
        assetId: "fast-layer",
        url: `/${prefix}-fast.png`,
        frame: { x: 0, y: 0, width: 10, height: 10 },
        zIndex: 0,
        blendMode: "normal",
      },
    ],
    canvas: { width: 10, height: 10 },
  } as unknown as AssetPack;
}
