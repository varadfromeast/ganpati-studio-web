export const SLOT_IDS = ["crown", "garland", "outfit", "offering", "scene"] as const;

export type SlotId = (typeof SLOT_IDS)[number];
export type SelectionMap = Partial<Record<SlotId, string>>;

export type PixelFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AssetLayer = {
  assetId: string;
  url: string;
  frame: PixelFrame;
  zIndex: number;
  blendMode: string;
};

export type Variant = {
  id: string;
  slot: SlotId;
  title: string;
  meaning: string;
  thumbnailUrl: string;
  layerAssetIds: string[];
  collectionTags: string[];
  reviewStatus: "approved" | "preview";
};

export type Preset = {
  id: string;
  title: string;
  selections: SelectionMap;
};

export type AssetPack = {
  slug: string;
  folder: string;
  postureId: string;
  baseVersion: string;
  title: string;
  description: string;
  accessibilityDescription: string;
  canvas: { width: number; height: number };
  slots: SlotId[];
  variants: Variant[];
  layers: AssetLayer[];
  fixedLayerAssetIds: string[];
  defaultSelections: SelectionMap;
  presets: Preset[];
  contentPolicy: "release-approved";
};

export type EditorHistory = {
  initial: SelectionMap;
  past: SelectionMap[];
  present: SelectionMap;
  future: SelectionMap[];
};
