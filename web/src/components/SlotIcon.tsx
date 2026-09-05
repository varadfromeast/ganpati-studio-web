import { Crown, Flower2, Gift, Image as ImageIcon, Shirt } from "lucide-react";
import type { SlotId } from "../domain/types";

const icons = {
  crown: Crown,
  garland: Flower2,
  outfit: Shirt,
  offering: Gift,
  scene: ImageIcon,
};

export function SlotIcon({ slot, size = 22 }: { slot: SlotId; size?: number }) {
  const Icon = icons[slot];
  return <Icon aria-hidden="true" size={size} strokeWidth={2} />;
}

export const slotLabels: Record<SlotId, string> = {
  crown: "Crown",
  garland: "Garland",
  outfit: "Outfit",
  offering: "Modak",
  scene: "Scene",
};
