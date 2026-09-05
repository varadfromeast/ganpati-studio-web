#!/usr/bin/env python3
"""Build the Royal Bal Kavach layer from its approved fitted composite.

The ImageGen composite is an art source, never a runtime layer. This script
clips it to the canonical armor pieces, softly contracts the edges, and restores
the fixed trunk foreground so the Base Murti keeps ownership of identity pixels.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


CANVAS = (941, 1672)
OUTFIT_THUMBNAIL_CROP = (190, 746, 751, 1307)

# Piece silhouettes are canonical-pixel geometry on murti.bal-seated.v1.
# They deliberately stop short of the palm, modak fingers, face, and crossed feet.
ARMOR_PIECES = (
    # collar + breastplate + articulated waist
    ((326, 820), (390, 823), (432, 842), (510, 836), (588, 821), (638, 842),
     (660, 906), (643, 996), (625, 1064), (610, 1138), (534, 1164),
     (470, 1174), (401, 1158), (332, 1132), (315, 1055), (298, 978),
     (293, 900)),
    # left pauldron / sleeve
    ((277, 835), (337, 817), (397, 850), (408, 918), (369, 963),
     (322, 969), (277, 940), (257, 887)),
    # right pauldron / sleeve
    ((545, 846), (604, 818), (665, 842), (696, 896), (685, 952),
     (643, 976), (588, 952), (562, 914)),
    # blessing-arm cuff
    ((230, 962), (282, 952), (326, 982), (330, 1039), (298, 1076),
     (245, 1068), (218, 1027)),
    # offering-arm cuff; fingers are restored by the fixed hand occluder
    ((628, 971), (682, 980), (715, 1023), (704, 1080), (659, 1094),
     (622, 1060)),
    # left bent-leg guard
    ((225, 1083), (330, 1070), (397, 1128), (407, 1211), (377, 1281),
     (315, 1314), (242, 1292), (198, 1235), (199, 1156)),
    # right bent-leg guard
    ((543, 1125), (611, 1076), (706, 1093), (746, 1161), (740, 1235),
     (697, 1293), (626, 1314), (565, 1284), (535, 1212)),
    # central tasset
    ((395, 1070), (470, 1045), (544, 1074), (542, 1190), (515, 1270),
     (470, 1292), (424, 1268), (397, 1190)),
    # ankle bands, ending before toes
    ((314, 1215), (405, 1210), (450, 1257), (435, 1305), (373, 1307),
     (322, 1280)),
    ((492, 1255), (540, 1210), (627, 1218), (617, 1282), (565, 1308),
     (505, 1303)),
)


def build(base_path: Path, composite_path: Path, output_path: Path, mask_path: Path) -> None:
    import numpy as np

    base = Image.open(base_path).convert("RGB")
    composite = Image.open(composite_path).convert("RGB")
    if base.size != CANVAS or composite.size != CANVAS:
        raise ValueError(f"Both inputs must be {CANVAS[0]}x{CANVAS[1]} pixels")

    geometry = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(geometry)
    for polygon in ARMOR_PIECES:
        draw.polygon(polygon, fill=255)

    # Retain only material changes; this prevents low-level ImageGen drift in
    # exposed skin and produces a soft, antialiased garment boundary.
    difference = ImageChops.difference(base, composite)
    diff_array = np.asarray(difference, dtype=np.int16).max(axis=2)
    alpha = np.clip((diff_array - 8) * (255 / 34), 0, 255).astype(np.uint8)
    alpha_image = Image.fromarray(alpha, mode="L")
    alpha_image = alpha_image.filter(ImageFilter.MaxFilter(5))
    alpha_image = alpha_image.filter(ImageFilter.GaussianBlur(1.15))
    alpha_image = ImageChops.multiply(alpha_image, geometry)

    layer = composite.convert("RGBA")
    layer.putalpha(alpha_image)
    layer_array = np.asarray(layer).copy()
    layer_array[layer_array[:, :, 3] == 0, :3] = 0
    layer = Image.fromarray(layer_array, mode="RGBA")
    fit_mask = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    fit_mask.putalpha(geometry)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mask_path.parent.mkdir(parents=True, exist_ok=True)
    layer.save(output_path)
    fit_mask.save(mask_path)


def build_thumbnail(composite_path: Path, thumbnail_path: Path) -> None:
    """Match every outfit tile to the same dressed-murti torso-and-legs crop."""
    composite = Image.open(composite_path).convert("RGB")
    if composite.size != CANVAS:
        raise ValueError(f"Composite must be {CANVAS[0]}x{CANVAS[1]} pixels")
    thumbnail = composite.crop(OUTFIT_THUMBNAIL_CROP)
    thumbnail = thumbnail.resize((256, 256), Image.Resampling.LANCZOS).convert("RGBA")
    thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
    thumbnail.save(thumbnail_path, optimize=False, compress_level=9)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--composite", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--mask", type=Path, required=True)
    parser.add_argument("--thumbnail", type=Path)
    args = parser.parse_args()
    build(args.base, args.composite, args.out, args.mask)
    if args.thumbnail is not None:
        build_thumbnail(args.composite, args.thumbnail)


if __name__ == "__main__":
    main()
