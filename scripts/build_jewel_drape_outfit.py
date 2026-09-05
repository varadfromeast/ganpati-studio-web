#!/usr/bin/env python3
"""Build the fitted Jewel Festival Drape from its approved composite.

ImageGen supplies textile detail, while canonical pixel geometry owns fit and
occlusion. The resulting layer is canvas-aligned and safe to render below the
fixed trunk and offering-finger foreground layers.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


CANVAS = (941, 1672)

# Canonical-pixel envelopes measured on murti.bal-seated.v1. These follow the
# diagonal angavastram and the existing bent-leg dhoti silhouette without
# entering the face, palms, Modak, crossed feet, cushion, or background.
UPPER_PIECES = (
    # shoulder-to-waist diagonal drape
    ((523, 806), (604, 812), (651, 856), (674, 922), (650, 1004),
     (610, 1085), (548, 1138), (458, 1154), (365, 1128), (298, 1073),
     (297, 1016), (329, 962), (399, 914), (472, 868)),
)

LOWER_PIECES = (
    # viewer-left bent-leg cloth
    ((279, 1045), (377, 1054), (442, 1110), (462, 1197), (428, 1271),
     (373, 1304), (290, 1305), (225, 1264), (193, 1198), (205, 1119)),
    # viewer-right bent-leg cloth
    ((514, 1080), (603, 1048), (688, 1071), (736, 1126), (751, 1198),
     (727, 1261), (670, 1303), (580, 1305), (518, 1266), (492, 1190)),
    # waist knot and center pleats
    ((344, 1041), (467, 1028), (588, 1052), (614, 1122), (572, 1187),
     (531, 1248), (500, 1290), (441, 1287), (403, 1242), (361, 1184),
     (326, 1118)),
)

TAIL_PIECES = (
    # loose right-side tail, still above the cushion edge
    ((690, 1158), (754, 1170), (791, 1203), (786, 1241), (746, 1237),
     (704, 1208)),
)

FEET_PROTECTION = (
    ((397, 1201), (448, 1192), (474, 1211), (498, 1194), (548, 1208),
     (570, 1254), (551, 1303), (509, 1320), (463, 1318), (419, 1305),
     (391, 1260)),
)

HAND_PROTECTION = (
    # blessing palm, wrist, and exposed forearm
    ((201, 817), (280, 808), (326, 873), (338, 973), (323, 1048),
     (283, 1081), (229, 1057), (205, 984)),
    # Modak, holding fingers, wrist, and exposed offering forearm
    ((644, 911), (684, 924), (716, 959), (729, 1032), (704, 1096),
     (647, 1112), (616, 1072), (621, 988)),
)


def clear_transparent_rgb(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels, mode="RGBA")


def build_thumbnail(reference: Image.Image) -> Image.Image:
    crop = reference.crop((190, 746, 751, 1307))
    return crop.resize((256, 256), Image.Resampling.LANCZOS).convert("RGBA")


def protection_mask(trunk_path: Path, fingers_path: Path) -> Image.Image:
    protected = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(protected)
    for polygon in FEET_PROTECTION + HAND_PROTECTION:
        draw.polygon(polygon, fill=255)

    for path in (trunk_path, fingers_path):
        occluder = Image.open(path).convert("RGBA")
        if occluder.size != CANVAS:
            raise ValueError(f"Occluder must be {CANVAS[0]}x{CANVAS[1]} pixels: {path}")
        expanded = occluder.getchannel("A").filter(ImageFilter.MaxFilter(9))
        protected = ImageChops.lighter(protected, expanded)
    return protected


def build(
    base_path: Path,
    composite_path: Path,
    trunk_path: Path,
    fingers_path: Path,
    layer_path: Path,
    reference_path: Path,
    thumbnail_path: Path,
) -> None:
    base = Image.open(base_path).convert("RGB")
    composite = Image.open(composite_path).convert("RGB")
    if base.size != CANVAS or composite.size != CANVAS:
        raise ValueError(f"Both inputs must be {CANVAS[0]}x{CANVAS[1]} pixels")

    upper_geometry = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(upper_geometry)
    for polygon in UPPER_PIECES:
        draw.polygon(polygon, fill=255)

    lower_geometry = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(lower_geometry)
    for polygon in LOWER_PIECES:
        draw.polygon(polygon, fill=255)
    base_hsv = np.asarray(base.convert("HSV"))
    base_hue, base_saturation = base_hsv[:, :, 0], base_hsv[:, :, 1]
    source_dhoti = (
        (base_hue >= 10) & (base_hue <= 40) & (base_saturation >= 105)
    )
    source_dhoti_mask = Image.fromarray(source_dhoti.astype(np.uint8) * 255, mode="L")
    source_dhoti_mask = source_dhoti_mask.filter(ImageFilter.MaxFilter(9))
    lower_geometry = ImageChops.multiply(lower_geometry, source_dhoti_mask)

    tail_geometry = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(tail_geometry)
    for polygon in TAIL_PIECES:
        draw.polygon(polygon, fill=255)
    geometry = ImageChops.lighter(ImageChops.lighter(upper_geometry, lower_geometry), tail_geometry)

    pixels = np.asarray(composite.convert("HSV"))
    hue, saturation, value = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    # The requested textile palette supplies a reliable semantic core. Growing
    # it recovers low-saturation folds and antialiased zari without accepting
    # low-level ImageGen drift from exposed skin inside the broad envelopes.
    palette_core = (
        (value >= 28)
        & (
            ((saturation >= 145) & (hue >= 13) & (hue <= 47))  # gold zari
            | ((saturation >= 92) & (hue >= 105) & (hue <= 151))  # teal
            | ((saturation >= 92) & (hue >= 178))  # purple / magenta
        )
    )
    palette = Image.fromarray(palette_core.astype(np.uint8) * 255, mode="L")
    palette = palette.filter(ImageFilter.MaxFilter(15))

    difference = ImageChops.difference(base, composite)
    diff_array = np.asarray(difference, dtype=np.int16).max(axis=2)
    diff_alpha = np.clip((diff_array - 8) * (255 / 38), 0, 255).astype(np.uint8)
    alpha = Image.fromarray(diff_alpha, mode="L")
    alpha = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    alpha = ImageChops.multiply(alpha, palette)
    alpha = ImageChops.multiply(alpha, geometry)
    alpha = ImageChops.multiply(alpha, ImageChops.invert(protection_mask(trunk_path, fingers_path)))

    layer = composite.convert("RGBA")
    layer.putalpha(alpha)
    layer = clear_transparent_rgb(layer)

    reference = base.convert("RGBA")
    reference.alpha_composite(layer)
    reference.alpha_composite(Image.open(fingers_path).convert("RGBA"))
    reference.alpha_composite(Image.open(trunk_path).convert("RGBA"))
    reference = reference.convert("RGB")

    for path in (layer_path, reference_path, thumbnail_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    layer.save(layer_path, optimize=False, compress_level=9)
    reference.save(reference_path, optimize=False, compress_level=9)
    build_thumbnail(reference).save(thumbnail_path, optimize=False, compress_level=9)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--composite", type=Path, required=True)
    parser.add_argument("--trunk", type=Path, required=True)
    parser.add_argument("--fingers", type=Path, required=True)
    parser.add_argument("--layer", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--thumbnail", type=Path, required=True)
    args = parser.parse_args()
    build(
        args.base,
        args.composite,
        args.trunk,
        args.fingers,
        args.layer,
        args.reference,
        args.thumbnail,
    )


if __name__ == "__main__":
    main()
