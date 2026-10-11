import type { AssetLayer, AssetPack, SelectionMap } from "./types";

export function compositionPlan(pack: AssetPack, selections: SelectionMap): AssetLayer[] {
  const selectedLayerIds = new Set(pack.fixedLayerAssetIds);
  for (const slot of pack.slots) {
    const selectedId = selections[slot];
    const variant = pack.variants.find((candidate) => candidate.slot === slot && candidate.id === selectedId);
    if (!variant) throw new Error(`Choose a valid ${slot} Variant before rendering.`);
    variant.layerAssetIds.forEach((assetId) => selectedLayerIds.add(assetId));
  }
  return pack.layers
    .filter((layer) => selectedLayerIds.has(layer.assetId))
    .sort((left, right) => left.zIndex - right.zIndex || left.assetId.localeCompare(right.assetId));
}

const loadedImages = new Map<string, Promise<HTMLImageElement>>();
const renderVersions = new WeakMap<HTMLCanvasElement, number>();

function loadImage(url: string): Promise<HTMLImageElement> {
  const existing = loadedImages.get(url);
  if (existing) return existing;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("One artwork layer could not be loaded."));
    image.src = url;
  });
  loadedImages.set(url, promise);
  void promise.catch(() => {
    if (loadedImages.get(url) === promise) loadedImages.delete(url);
  });
  return promise;
}

export async function drawComposition(
  canvas: HTMLCanvasElement,
  pack: AssetPack,
  selections: SelectionMap,
  scale = 1,
): Promise<void> {
  const renderVersion = (renderVersions.get(canvas) ?? 0) + 1;
  renderVersions.set(canvas, renderVersion);
  const width = Math.round(pack.canvas.width * scale);
  const height = Math.round(pack.canvas.height * scale);
  const plan = compositionPlan(pack, selections);
  const images = await Promise.all(plan.map((layer) => loadImage(layer.url)));

  // A quick succession of Variant taps can finish loading out of order. Only
  // the newest render may touch this canvas, so an older request cannot mix
  // stale layers into the current Design.
  if (renderVersions.get(canvas) !== renderVersion) return;

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Your browser could not prepare the artwork canvas.");
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  for (const [index, layer] of plan.entries()) {
    const image = images[index];
    if (!image) throw new Error("One artwork layer could not be loaded.");
    const { x, y, width: frameWidth, height: frameHeight } = layer.frame;
    context.globalCompositeOperation = layer.blendMode === "multiply" ? "multiply" : "source-over";
    context.drawImage(
      image,
      Math.round(x * scale),
      Math.round(y * scale),
      Math.round(frameWidth * scale),
      Math.round(frameHeight * scale),
    );
  }
  context.globalCompositeOperation = "source-over";
}

export async function canvasPNG(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The artwork could not be exported as a PNG.");
  return blob;
}
