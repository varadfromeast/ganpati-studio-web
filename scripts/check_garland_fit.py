#!/usr/bin/env python3
"""Fast attachment and trunk-clearance checks for every shipped garland."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "assets/packs/bal-seated-crowns-v2"
BASE = ROOT / "assets/runtime/cute/cute-bal-ganpati-base-v1.png"
GARLANDS = (
    PACK / "layers/garland-rose-jasmine.png",
    PACK / "layers/garland-rose-jasmine-flowing.png",
    PACK / "layers/garland-marigold.png",
    PACK / "layers/garland-lotus-jasmine.png",
)
TRUNK = PACK / "layers/fixed-trunk-foreground.png"
ATTACHMENTS = ((344, 842), (614, 842))


def visible(mask: Image.Image) -> Image.Image:
    return mask.point(lambda value: 255 if value else 0)


def count(mask: Image.Image) -> int:
    return sum(value != 0 for value in mask.get_flattened_data())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clearance", type=int, default=10)
    parser.add_argument("--max-clearance-overlap", type=int, default=500)
    args = parser.parse_args()

    base = Image.open(BASE).convert("RGBA")
    trunk = Image.open(TRUNK).convert("RGBA")
    trunk_alpha = visible(trunk.getchannel("A"))
    trunk_core = trunk.getchannel("A").point(lambda value: 255 if value == 255 else 0)
    clearance_size = args.clearance * 2 + 1
    trunk_clearance = trunk_alpha.filter(ImageFilter.MaxFilter(clearance_size))

    for garland_path in GARLANDS:
        garland = Image.open(garland_path).convert("RGBA")
        garland_alpha = visible(garland.getchannel("A"))
        overlap = count(ImageChops.multiply(garland_alpha, trunk_alpha))
        clearance_overlap = count(ImageChops.multiply(garland_alpha, trunk_clearance))

        composite = base.copy()
        composite.alpha_composite(garland)
        composite.alpha_composite(trunk)
        trunk_difference = ImageChops.difference(composite, base)
        red, green, blue, alpha = trunk_difference.split()
        any_channel_difference = ImageChops.lighter(
            ImageChops.lighter(red, green), ImageChops.lighter(blue, alpha)
        )
        changed_trunk_pixels = count(
            ImageChops.multiply(visible(any_channel_difference), trunk_core)
        )
        for x, y in ATTACHMENTS:
            attachment = garland_alpha.crop((x - 24, y - 24, x + 25, y + 25))
            if count(attachment) < 20:
                raise SystemExit(f"FAIL: {garland_path.name} misses attachment {(x, y)}")
        print(
            f"garland={garland_path.name} trunk_overlap={overlap} "
            f"clearance_overlap={clearance_overlap} "
            f"changed_trunk_pixels={changed_trunk_pixels}"
        )
        if overlap:
            raise SystemExit(f"FAIL: {garland_path.name} occupies trunk pixels")
        if clearance_overlap > args.max_clearance_overlap:
            raise SystemExit(
                f"FAIL: {garland_path.name} crowds the trunk silhouette "
                f"({clearance_overlap} > {args.max_clearance_overlap})"
            )
        if changed_trunk_pixels:
            raise SystemExit("FAIL: compositing does not restore exact Base Murti trunk pixels")
    print("PASS: every garland occupies both attachments and preserves trunk clearance")


if __name__ == "__main__":
    main()
