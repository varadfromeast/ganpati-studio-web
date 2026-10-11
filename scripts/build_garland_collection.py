#!/usr/bin/env python3
"""Build every garland from one approved body path and small flower components.

The generated image model is used only for isolated flowers.  Geometry remains
deterministic: all four options share the same two attachment points, Bezier
centerlines, drop point, endpoint taper, and trunk-clearance validation.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

from accessory_fitting import (
    Centerpiece,
    GarlandDesign,
    GarlandSocket,
    Point,
    fit_garland,
)
from accessory_fitting.garland_artwork import load_garland_sprites


ROOT = Path(__file__).resolve().parents[1]
CANVAS = (941, 1672)
PACK = ROOT / "assets/packs/bal-seated-crowns-v2"
BASE = PACK / "layers/base.png"
COMPONENTS = ROOT / "design/asset-sources/garlands/components-v2"
PREVIEWS = ROOT / "assets/staging/cute/garlands/fitted/previews"


# These points were approved against the canonical 941 x 1672 Base Murti.
# The old y=814 endpoints put half of a flower beside the cheeks.  The new
# y=842 endpoints sit on the lower-neck seam, and the curves do not converge
# until below the fixed trunk silhouette.
LEFT_ATTACH = Point(344, 842)
RIGHT_ATTACH = Point(614, 842)
DROP = Point(468, 1132)
TRUNK_POLYGON = (
    Point(451, 731),
    Point(493, 731),
    Point(499, 791),
    Point(509, 836),
    Point(531, 873),
    Point(570, 890),
    Point(581, 918),
    Point(570, 947),
    Point(542, 956),
    Point(523, 941),
    Point(539, 920),
    Point(514, 907),
    Point(492, 879),
    Point(473, 840),
    Point(458, 793),
)
SEATED_GARLAND_SOCKET = GarlandSocket(
    canvas_size=CANVAS,
    left_attachment=LEFT_ATTACH,
    right_attachment=RIGHT_ATTACH,
    center_drop=DROP,
    left_controls=(Point(314, 914), Point(354, 1074)),
    right_controls=(Point(650, 914), Point(594, 1074)),
    occluder_polygon=TRUNK_POLYGON,
    endpoint_taper=0.72,
)

# The anatomy is locked in one pose-owned socket. Each option only describes
# its artwork rhythm, so it cannot accidentally override the seated fit.
GARLAND_DESIGNS = {
    "garland-rose-jasmine.png": GarlandDesign(
        ("rose", "jasmine"),
        spacing=24,
        widths=(31, 17),
        thread_width=3,
        phase=0.15,
    ),
    "garland-rose-jasmine-flowing.png": GarlandDesign(
        ("flowingRose",),
        spacing=35,
        widths=(29,),
        thread_width=3,
        phase=0.8,
    ),
    "garland-marigold.png": GarlandDesign(
        ("marigoldOrange", "marigoldYellow"),
        spacing=31,
        widths=(42, 36),
        thread_width=4,
        phase=0.35,
    ),
    "garland-lotus-jasmine.png": GarlandDesign(
        ("jasmine",),
        spacing=18,
        widths=(17,),
        thread_width=3,
        centerpiece=Centerpiece("lotus", 112, Point(0, 6)),
        phase=0.0,
    ),
}


def clear_transparent_rgb(image: Image.Image) -> Image.Image:
    red, green, blue, alpha = image.convert("RGBA").split()
    visible = alpha.point(lambda value: 255 if value else 0)
    empty = Image.new("L", image.size, 0)
    return Image.merge(
        "RGBA",
        (
            Image.composite(red, empty, visible),
            Image.composite(green, empty, visible),
            Image.composite(blue, empty, visible),
            alpha,
        ),
    )


def load_sprites() -> dict[str, Image.Image]:
    return load_garland_sprites(COMPONENTS)


def build_garlands(sprites: dict[str, Image.Image]) -> dict[str, Image.Image]:
    """Fit every seated Mala design through the shared anatomical socket."""
    return {
        layer_name: fit_garland(sprites, SEATED_GARLAND_SOCKET, design)
        for layer_name, design in GARLAND_DESIGNS.items()
    }


def count(mask: Image.Image) -> int:
    return sum(value != 0 for value in mask.get_flattened_data())


def validate(layer: Image.Image, trunk: Image.Image, name: str) -> tuple[int, int, int, int]:
    alpha = layer.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"{name} is empty")
    if not 820 <= bounds[1] <= 842:
        raise ValueError(f"{name} starts at y={bounds[1]}, outside approved 820...842")
    if bounds[3] > 1205:
        raise ValueError(f"{name} drops too low at y={bounds[3]}")

    binary = alpha.point(lambda value: 255 if value else 0)
    trunk_clearance = trunk.getchannel("A").point(
        lambda value: 255 if value else 0
    ).filter(ImageFilter.MaxFilter(21))
    overlap = count(ImageChops.multiply(binary, trunk_clearance))
    if overlap:
        raise ValueError(f"{name} violates the 10px trunk clearance by {overlap} pixels")

    for label, point in (("left", LEFT_ATTACH), ("right", RIGHT_ATTACH)):
        radius = 24
        region = binary.crop(
            (
                round(point.x) - radius,
                round(point.y) - radius,
                round(point.x) + radius + 1,
                round(point.y) + radius + 1,
            )
        )
        if count(region) < 20:
            raise ValueError(f"{name} does not occupy its {label} attachment point")
    return bounds


def build_thumbnail(layer: Image.Image) -> Image.Image:
    bounds = layer.getchannel("A").getbbox()
    assert bounds is not None
    visible = layer.crop(bounds)
    visible.thumbnail((224, 224), Image.Resampling.LANCZOS)
    thumbnail = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    thumbnail.alpha_composite(
        visible,
        ((256 - visible.width) // 2, (256 - visible.height) // 2),
    )
    return clear_transparent_rgb(thumbnail)


def sha256(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    sprites = load_sprites()
    base = Image.open(BASE).convert("RGBA")
    trunk_path = PACK / "layers/fixed-trunk-foreground.png"
    trunk = Image.open(trunk_path).convert("RGBA")
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    for folder in ("layers", "thumbnails", "references", "fit-masks"):
        (PACK / folder).mkdir(parents=True, exist_ok=True)

    union_alpha = Image.new("L", CANVAS, 0)
    bounds_by_name: dict[str, tuple[int, int, int, int]] = {}
    for layer_name, layer in build_garlands(sprites).items():
        bounds = validate(layer, trunk, layer_name)
        bounds_by_name[layer_name] = bounds
        layer_path = PACK / "layers" / layer_name
        layer.save(layer_path, optimize=False, compress_level=9)
        build_thumbnail(layer).save(
            PACK / "thumbnails" / layer_name,
            optimize=False,
            compress_level=9,
        )
        reference = base.copy()
        reference.alpha_composite(layer)
        reference.alpha_composite(trunk)
        reference.save(
            PACK / "references" / layer_name,
            optimize=False,
            compress_level=9,
        )
        reference.convert("RGB").save(
            PREVIEWS / layer_name.replace(".png", ".jpg"), quality=94
        )
        union_alpha = ImageChops.lighter(union_alpha, layer.getchannel("A"))

    neutral = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    neutral_x = round(SEATED_GARLAND_SOCKET.left_attachment.x)
    neutral_y = round(SEATED_GARLAND_SOCKET.left_attachment.y)
    neutral.putpixel((neutral_x, neutral_y), base.getpixel((neutral_x, neutral_y)))
    neutral_path = PACK / "layers/garland-none.png"
    neutral.save(neutral_path, optimize=False, compress_level=9)

    fit_mask = Image.new("RGBA", CANVAS, (255, 255, 255, 0))
    fit_mask.putalpha(union_alpha)
    fit_mask_path = PACK / "fit-masks/garland-chest-zone.png"
    fit_mask.save(fit_mask_path, optimize=False, compress_level=9)

    manifest_path = PACK / "manifest.v2.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    socket = next(item for item in manifest["sockets"] if item["slot"] == "garland")
    socket["anchor"] = {
        "x": round(SEATED_GARLAND_SOCKET.anchor.x),
        "y": round(SEATED_GARLAND_SOCKET.anchor.y),
    }
    socket["fitGeometry"] = SEATED_GARLAND_SOCKET.manifest_geometry()
    socket["fitGeometry"]["pathAuthoring"]["componentSet"] = (
        "design/asset-sources/garlands/components-v2"
    )
    socket["fitMask"]["contentHash"] = sha256(fit_mask_path)

    hashes = {
        f"layers/{layer_name}": sha256(PACK / "layers" / layer_name)
        for layer_name in GARLAND_DESIGNS
    }
    hashes["layers/garland-none.png"] = sha256(neutral_path)
    for layer in manifest["layers"]:
        if layer["file"] in hashes:
            layer["contentHash"] = hashes[layer["file"]]
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    for name, bounds in bounds_by_name.items():
        print(f"{name}: alphaBounds={bounds}")
    print(f"attachments=({LEFT_ATTACH}, {RIGHT_ATTACH}), drop={DROP}")
    print("PASS: every garland occupies both attachments and clears trunk by 10px")


if __name__ == "__main__":
    main()
