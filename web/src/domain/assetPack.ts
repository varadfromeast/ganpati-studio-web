import {
  SLOT_IDS,
  type AssetLayer,
  type AssetPack,
  type PixelFrame,
  type Preset,
  type SelectionMap,
  type SlotId,
  type Variant,
} from "./types";

type ManifestLayer = {
  assetID: string;
  file: string;
  frame: PixelFrame;
  zIndex: number;
  blendMode?: string;
};

type ManifestOption = {
  optionID: string;
  slot: string;
  displayName: string;
  thumbnail: string;
  layerBindings: Array<{ role: string; assetID: string }>;
  collectionTags?: string[];
  technicalReview?: { status?: string };
  culturalReview?: { status?: string };
};

type AssetPackManifest = {
  schemaVersion: number;
  posture: {
    id: string;
    baseVersion: string;
    canvas: { width: number; height: number };
    fixedLayerAssetIDs: string[];
    supportedSlots: string[];
    defaultSelections: Record<string, string>;
  };
  layers: ManifestLayer[];
  optionGroups: ManifestOption[];
};

type PackDefinition = {
  slug: string;
  folder: string;
  title: string;
  description: string;
  accessibilityDescription: string;
  presets: Preset[];
};

const meaningByVariant: Record<string, string> = {
  "crown.none.v1": "Keeps Bappa’s natural curls and tilak open to view.",
  "crown.royal.v1": "A compact ruby mukut shaped to the seated Base Murti.",
  "crown.peacock.v1": "Peacock teal and gold bring a bright festival note.",
  "crown.flower.v1": "Jasmine, marigold and lotus form a gentle floral crown.",
  "crown.blue-lotus.v1": "A blue-lotus mukut with pearl bands and a sapphire centre.",
  "garland.none.v1": "Keeps the fitted outfit neckline unobstructed.",
  "garland.rose.v1": "A compact rose-and-jasmine temple mala.",
  "garland.rose-flowing.v1": "Rose and jasmine settle along a softer, flowing curve.",
  "garland.marigold.v1": "Warm marigolds carry an unmistakable festive welcome.",
  "garland.lotus-jasmine.v1": "Lotus and jasmine create a calm ceremonial rhythm.",
  "outfit.saffron.v1": "The Base Murti’s pink drape and warm gold border remain visible.",
  "outfit.armor-royal.v1": "Ceremonial gold-and-rose kavach fitted to this exact form.",
  "outfit.teal.v1": "Peacock teal, saffron and gold zari in a traditional palette.",
  "outfit.jewel-festival.v1": "Teal, magenta and purple gather around a turquoise waist jewel.",
  "offering.classic.v1": "The familiar modak symbolizes the sweetness of wisdom.",
  "offering.kesar.v1": "A saffron-toned modak prepared for a warm festive setting.",
  "offering.rose.v1": "A rose-accented offering for a softer celebration palette.",
  "scene.original.v1": "The warm home shrine where this Base Murti was composed.",
  "scene.celestial-aarti.v1": "A deeper lamp-lit setting for aarti and evening blessings.",
};

function dancingMeaning(optionId: string): string {
  const normalized = optionId.replace(".bal-dancing", "");
  return meaningByVariant[normalized]
    ?? "A fitted Variant authored for the Dancing Joy Base Murti.";
}

export const PACK_DEFINITIONS: PackDefinition[] = [
  {
    slug: "seated",
    folder: "bal-seated-crowns-v2",
    title: "Seated Blessing",
    description: "A calm seated Base Murti with fitted crowns, malas, outfits, modaks and scenes.",
    accessibilityDescription: "Bal Ganesha seated in a warm home shrine, ready for respectful shringar.",
    presets: [
      {
        id: "home-blessing",
        title: "Home Blessing",
        selections: {
          crown: "crown.flower.v1",
          garland: "garland.lotus-jasmine.v1",
          outfit: "outfit.saffron.v1",
          offering: "offering.classic.v1",
          scene: "scene.original.v1",
        },
      },
      {
        id: "peacock-celebration",
        title: "Peacock Celebration",
        selections: {
          crown: "crown.peacock.v1",
          garland: "garland.marigold.v1",
          outfit: "outfit.teal.v1",
          offering: "offering.kesar.v1",
          scene: "scene.original.v1",
        },
      },
      {
        id: "royal-aarti",
        title: "Royal Aarti",
        selections: {
          crown: "crown.royal.v1",
          garland: "garland.rose-flowing.v1",
          outfit: "outfit.armor-royal.v1",
          offering: "offering.rose.v1",
          scene: "scene.celestial-aarti.v1",
        },
      },
    ],
  },
  {
    slug: "dancing",
    folder: "bal-dancing-geometry-v1",
    title: "Dancing Joy",
    description: "A joyful dancing Base Murti with its own precisely fitted festival shringar.",
    accessibilityDescription: "Bal Ganesha dancing joyfully in a warm home shrine, ready for respectful shringar.",
    presets: [
      {
        id: "royal-marigold",
        title: "Royal Marigold",
        selections: {
          crown: "crown.royal.bal-dancing.v1",
          garland: "garland.marigold.bal-dancing.v1",
          outfit: "outfit.saffron.bal-dancing.v1",
          scene: "scene.original.bal-dancing.v1",
        },
      },
      {
        id: "peacock-rose",
        title: "Peacock Rose",
        selections: {
          crown: "crown.peacock.bal-dancing.v1",
          garland: "garland.rose.bal-dancing.v1",
          outfit: "outfit.teal.bal-dancing.v1",
          scene: "scene.original.bal-dancing.v1",
        },
      },
      {
        id: "lotus-jasmine",
        title: "Lotus Jasmine",
        selections: {
          crown: "crown.blue-lotus.bal-dancing.v1",
          garland: "garland.lotus-jasmine.bal-dancing.v1",
          outfit: "outfit.jewel-festival.bal-dancing.v1",
          scene: "scene.celestial-aarti.bal-dancing.v1",
        },
      },
    ],
  },
];

function isSlotId(value: string): value is SlotId {
  return (SLOT_IDS as readonly string[]).includes(value);
}

function validateManifest(value: unknown): AssetPackManifest {
  if (!value || typeof value !== "object") throw new Error("Asset Pack manifest is missing.");
  const manifest = value as Partial<AssetPackManifest>;
  if (
    manifest.schemaVersion !== 2
    || !manifest.posture
    || !Array.isArray(manifest.layers)
    || !Array.isArray(manifest.optionGroups)
    || !Number.isFinite(manifest.posture.canvas?.width)
    || !Number.isFinite(manifest.posture.canvas?.height)
  ) {
    throw new Error("Asset Pack manifest is not compatible with this web studio.");
  }
  return manifest as AssetPackManifest;
}

function selectedDefinition(slug: string): PackDefinition {
  const definition = PACK_DEFINITIONS.find((candidate) => candidate.slug === slug);
  if (!definition) throw new Error("This Base Murti is not available.");
  return definition;
}

export async function loadAssetPack(slug: string, signal?: AbortSignal): Promise<AssetPack> {
  const definition = selectedDefinition(slug);
  const root = `/packs/${definition.folder}`;
  const response = await fetch(
    `${root}/manifest.v2.json`,
    signal ? { signal } : undefined,
  );
  if (!response.ok) throw new Error("The Base Murti artwork could not be loaded.");
  const manifest = validateManifest(await response.json());

  const slots = manifest.posture.supportedSlots.filter(isSlotId);
  const layers: AssetLayer[] = manifest.layers.map((layer) => ({
    assetId: layer.assetID,
    url: `${root}/${layer.file}`,
    frame: layer.frame,
    zIndex: layer.zIndex,
    blendMode: layer.blendMode ?? "normal",
  }));
  const layerIds = new Set(layers.map((layer) => layer.assetId));
  const variants: Variant[] = manifest.optionGroups
    .filter((option): option is ManifestOption & { slot: SlotId } => isSlotId(option.slot))
    .map((option) => {
      const bindingIds = option.layerBindings.map((binding) => binding.assetID);
      if (!bindingIds.every((assetId) => layerIds.has(assetId))) {
        throw new Error(`Variant ${option.optionID} references unavailable artwork.`);
      }
      const approved = option.technicalReview?.status === "approved"
        && option.culturalReview?.status === "approved";
      return {
        id: option.optionID,
        slot: option.slot,
        title: option.displayName,
        meaning: meaningByVariant[option.optionID] ?? dancingMeaning(option.optionID),
        thumbnailUrl: `${root}/${option.thumbnail}`,
        layerAssetIds: bindingIds,
        collectionTags: option.collectionTags ?? [],
        reviewStatus: approved ? "approved" : "preview",
      };
    });

  const defaultSelections = Object.fromEntries(
    Object.entries(manifest.posture.defaultSelections).filter(([slot]) => isSlotId(slot)),
  ) as SelectionMap;
  for (const slot of slots) {
    const selected = defaultSelections[slot];
    if (!selected || !variants.some((variant) => variant.slot === slot && variant.id === selected)) {
      throw new Error(`Asset Pack has no valid default for ${slot}.`);
    }
  }

  if (variants.some((variant) => variant.reviewStatus !== "approved")) {
    throw new Error("This Base Murti has not completed release review.");
  }

  return {
    slug: definition.slug,
    folder: definition.folder,
    postureId: manifest.posture.id,
    baseVersion: manifest.posture.baseVersion,
    title: definition.title,
    description: definition.description,
    accessibilityDescription: definition.accessibilityDescription,
    canvas: manifest.posture.canvas,
    slots,
    variants,
    layers,
    fixedLayerAssetIds: manifest.posture.fixedLayerAssetIDs,
    defaultSelections,
    presets: definition.presets,
    contentPolicy: "release-approved",
  };
}

export function variantsFor(pack: AssetPack, slot: SlotId): Variant[] {
  return pack.variants.filter((variant) => variant.slot === slot);
}

export function packThumbnailUrl(slug: string): string {
  selectedDefinition(slug);
  return `/previews/${slug}.webp`;
}
