#!/usr/bin/env python3
"""Author the modular accessory contract for the Dancing Joy Base Murti.

The visual source components are reused from the seated pack, but every pixel is
re-fitted to murti.bal-dancing.v1. The resulting authoring pack is deterministic:
rerunning this script produces byte-identical layers, masks, thumbnails,
references, and manifest hashes.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageOps

from accessory_fitting import (
    Centerpiece,
    GarlandDesign,
    GarlandSocket,
    HeadwearDesign,
    HeadwearSocket,
    OutfitSocket,
    Point,
    WearableBand,
    author_scene_variant,
    fit_garland,
    fit_headwear,
    fit_outfit,
    garland_fit_envelope,
    isolate_outfit_composite,
)
from accessory_fitting.garland_artwork import (
    load_garland_sprites as load_approved_garland_sprites,
)


ROOT = Path(__file__).resolve().parents[1]
CANVAS = (941, 1672)
CLEAN_BASE_SOURCE = (
    ROOT / "design/asset-sources/base-murtis/bal-dancing-clean-v1.png"
)
SOURCE_PACK = ROOT / "assets/packs/bal-seated-crowns-v2"
COMPONENTS = ROOT / "design/asset-sources/garlands/components-v2"
FLOWER_CROWN_SOURCE = ROOT / "design/asset-sources/crowns/flower-circlet-reference-v2.png"
PACK = ROOT / "assets/packs/bal-dancing-geometry-v1"
OUTFIT_SOURCES = ROOT / "design/asset-sources/outfits/bal-dancing-v1"
CELESTIAL_SCENE_SOURCE = (
    ROOT
    / "design/asset-sources/backgrounds/celestial-aarti-empty-shrine-dancing-v2.png"
)
DANCING_FOREGROUND_MASK_SOURCE = (
    ROOT / "design/asset-sources/backgrounds/dancing-murti-foreground-mask-v2.png"
)


# The dancing pose tilts the shoulder line, so the attachment triangle is
# intentionally asymmetric. The viewer-right attachment sits on the inner
# shoulder/drape seam rather than beneath the trunk; otherwise the mala reads
# as hanging from the chest instead of being worn around the neck.
LEFT_ATTACH = Point(350, 765)
RIGHT_ATTACH = Point(620, 720)
DROP = Point(390, 950)
TRUNK_POLYGON = (
    Point(421, 640),
    Point(488, 632),
    Point(527, 665),
    Point(570, 690),
    Point(615, 706),
    Point(617, 746),
    Point(590, 774),
    Point(548, 779),
    Point(516, 764),
    Point(532, 741),
    Point(501, 735),
    Point(469, 712),
    Point(444, 680),
)
DANCING_GARLAND_SOCKET = GarlandSocket(
    canvas_size=CANVAS,
    left_attachment=LEFT_ATTACH,
    right_attachment=RIGHT_ATTACH,
    center_drop=DROP,
    left_controls=(Point(321, 830), Point(332, 905)),
    right_controls=(Point(650, 800), Point(548, 910)),
    occluder_polygon=TRUNK_POLYGON,
    endpoint_taper=0.68,
)

# The pose geometry above is shared. Only material rhythm and scale vary.
GARLAND_DESIGNS = {
    "marigold": GarlandDesign(
        ("marigoldOrange", "marigoldYellow"),
        # The 32px cadence makes the first post-occlusion flower meet the
        # curled-trunk edge. At 35px the right strand reads as floating.
        spacing=32,
        widths=(52, 46),
        thread_width=3,
        phase=0.35,
        shadow_offset=Point(2, 3),
        shadow_blur=3,
        shadow_opacity=0.16,
    ),
    "rose": GarlandDesign(
        ("rose", "jasmine"),
        spacing=27,
        widths=(38, 21),
        thread_width=3,
        phase=0.15,
        shadow_offset=Point(2, 3),
        shadow_blur=3,
        shadow_opacity=0.16,
    ),
    "rose-flowing": GarlandDesign(
        ("flowingRose",),
        spacing=32,
        widths=(36,),
        thread_width=3,
        phase=0.8,
        shadow_offset=Point(2, 3),
        shadow_blur=3,
        shadow_opacity=0.16,
    ),
    "lotus-jasmine": GarlandDesign(
        ("jasmine",),
        spacing=20,
        widths=(21,),
        thread_width=3,
        centerpiece=Centerpiece("lotus", 134, Point(0, 6)),
        shadow_offset=Point(2, 3),
        shadow_blur=3,
        shadow_opacity=0.16,
    ),
}

# Locked anatomical socket shared by every headwear Variant for this pose.
CROWN_SOCKET = HeadwearSocket(
    canvas_size=CANVAS,
    left_temple=(286, 515),
    right_temple=(571, 455),
    hairline_center=(430, 472),
    apex=(458, 237),
    left_ear_top=(237, 509),
    right_ear_top=(609, 466),
    tilak_top=(432, 492),
)
PEACOCK_BAND = WearableBand(
    left_endpoint=(20, 360),
    center_lower_rim=(202, 259),
    right_endpoint=(399, 360),
)
BLUE_LOTUS_BAND = WearableBand(
    left_endpoint=(20, 364),
    center_lower_rim=(202, 277),
    right_endpoint=(384, 364),
)
FLOWER_BAND = WearableBand(
    left_endpoint=(25, 390),
    center_lower_rim=(453, 235),
    right_endpoint=(835, 330),
)
# Each silhouette describes only its own band and proportions. The fitting
# module owns pose alignment and deliberately exposes no horizontal nudge.
CROWN_DESIGNS = {
    "royal": HeadwearDesign(width_factor=0.94, vertical_lift=16),
    "flower": HeadwearDesign(
        wearable_band=FLOWER_BAND,
        width_factor=0.82,
        vertical_lift=58,
    ),
    "peacock": HeadwearDesign(wearable_band=PEACOCK_BAND),
    "blue-lotus": HeadwearDesign(
        wearable_band=BLUE_LOTUS_BAND,
        width_factor=0.90,
        vertical_lift=18,
    ),
}
CROWN_CATALOG = {
    "royal": ("Dancing Royal Mukut", ["royal", "gold"]),
    "flower": ("Dancing Flower Crown", ["flower", "lotus"]),
    "peacock": ("Dancing Peacock Mukut", ["peacock", "gold"]),
    "blue-lotus": ("Dancing Blue Lotus Mukut", ["blue-lotus", "gold"]),
}

# One generous body envelope serves every standing outfit. The generated source
# composite determines each garment silhouette; these pose-owned regions only
# decide where changes are allowed. Exposed hands, feet, and the foreground
# trunk remain Base Murti identity pixels for every design.
DANCING_OUTFIT_SOCKET = OutfitSocket(
    canvas_size=CANVAS,
    # The seam's normalization anchor is the anatomical waist, not a visual
    # ornament. Every source can vary its belt/brooch drop while still fitting
    # from the same reviewed body point.
    anchor=(445, 970),
    garment_regions=(
        # viewer-left shoulder, sleeve, and flowing angavastram
        ((132, 690), (278, 686), (350, 748), (365, 850), (330, 962),
         (262, 1038), (174, 1055), (142, 1004), (146, 892), (205, 806)),
        # fitted torso, collar, and waist
        ((252, 696), (356, 688), (458, 716), (548, 683), (650, 704),
         (683, 792), (649, 908), (669, 1000), (614, 1088), (500, 1117),
         (374, 1098), (296, 1038), (272, 912)),
        # viewer-right shoulder and flowing angavastram
        ((565, 681), (662, 682), (710, 738), (755, 824), (814, 918),
         (811, 1012), (757, 1063), (682, 1033), (627, 960), (620, 824)),
        # waist, hip cloth, and the raised-leg garment
        ((252, 946), (407, 920), (520, 942), (627, 936), (695, 979),
         (733, 1068), (716, 1162), (665, 1236), (574, 1251), (503, 1201),
         (450, 1132), (332, 1120), (264, 1062)),
        # garment on the standing leg
        ((260, 990), (405, 1002), (489, 1050), (550, 1141), (574, 1249),
         (542, 1348), (496, 1395), (403, 1398), (330, 1350), (270, 1220)),
        # armor may add compact fitted wrist cuffs without changing the hands
        ((80, 650), (126, 635), (177, 671), (191, 724), (164, 756),
         (111, 742)),
        ((674, 650), (720, 633), (758, 668), (755, 722), (716, 748),
         (681, 716)),
    ),
    protected_regions=(
        tuple((point.x, point.y) for point in TRUNK_POLYGON),
        # raised bare foot
        ((468, 1125), (536, 1111), (593, 1155), (604, 1235),
         (566, 1284), (495, 1270), (461, 1214)),
        # grounded bare foot
        ((365, 1306), (434, 1286), (514, 1311), (552, 1375),
         (520, 1435), (430, 1447), (360, 1410)),
    ),
    thumbnail_crop=(150, 650, 800, 1300),
    fit_points=(
        ("leftShoulder", (300, 760)),
        ("rightShoulder", (680, 750)),
        ("leftCollar", (360, 750)),
        ("rightCollar", (600, 770)),
        ("upperTorso", (470, 820)),
        ("waist", (445, 970)),
        ("raisedKnee", (610, 1040)),
        ("standingLeg", (390, 1180)),
    ),
    minimum_fit_points=3,
    fit_point_radius=28,
)

# Every composite below was authored on this exact Base Murti canvas. Recover
# its layer in place so all outfits share the reviewed neck/shoulder/waist
# geometry; the socket clips protected anatomy but never re-scales the art.
OUTFIT_CATALOG = {
    "saffron": (
        "Saffron Drape",
        ["saffron", "base", "traditional"],
        None,
        None,
    ),
    "armor-royal": (
        "Royal Bal Kavach",
        ["armor", "royal", "gold", "ruby", "emerald"],
        OUTFIT_SOURCES / "armor-royal-composite-v1.png",
        None,
    ),
    "teal": (
        "Peacock Teal",
        ["peacock", "teal", "gold", "traditional"],
        OUTFIT_SOURCES / "peacock-teal-composite-v1.png",
        None,
    ),
    "jewel-festival": (
        "Jewel Festival Drape",
        ["peacock", "teal", "magenta", "purple", "gold", "festival"],
        OUTFIT_SOURCES / "jewel-festival-composite-v1.png",
        None,
    ),
}

# Armor and the festival dhoti are fitted silhouettes; unlike Peacock Teal,
# neither owns the socket's side regions reserved for flowing angavastram.
# Keeping this material-level choice separate prevents harmless background
# drift in a source composite from becoming a triangular runtime artifact.
FITTED_OUTFIT_REGION_INDICES = (1, 3, 4, 5, 6)
FITTED_OUTFITS = {"armor-royal", "jewel-festival"}
ARMOR_SHOULDER_REGIONS = (
    ((565, 681), (662, 682), (710, 738), (730, 790), (690, 840),
     (650, 820), (620, 760)),
)


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


def build_crown(name: str) -> Image.Image:
    if name == "flower":
        source = Image.open(FLOWER_CROWN_SOURCE).convert("RGBA")
        # Image extraction can leave isolated near-transparent speckles far
        # from the crown. Remove only that invisible noise before alpha crop.
        alpha = source.getchannel("A").point(
            [0 if value < 5 else value for value in range(256)]
        )
        source.putalpha(alpha)
        source = clear_transparent_rgb(source)
    else:
        source = Image.open(SOURCE_PACK / f"layers/crown-{name}.png").convert("RGBA")
    return fit_headwear(
        source,
        CROWN_SOCKET,
        design=CROWN_DESIGNS[name],
    )


def build_crowns() -> dict[str, Image.Image]:
    return {name: build_crown(name) for name in CROWN_DESIGNS}


def load_clean_base() -> Image.Image:
    source = Image.open(CLEAN_BASE_SOURCE).convert("RGBA")
    if source.width != CANVAS[0] or source.height not in {CANVAS[1] - 1, CANVAS[1]}:
        raise ValueError(
            f"Clean base must be 941x1671 or 941x1672, found {source.size}"
        )
    if source.height == CANVAS[1]:
        return source

    # The built-in image edit preserved the canonical width but returned one
    # fewer row. Extend the background by repeating only its final row rather
    # than scaling or distorting the murti.
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.alpha_composite(source, (0, 0))
    result.alpha_composite(source.crop((0, source.height - 1, source.width, source.height)), (0, source.height))
    return result


def load_garland_sprites() -> dict[str, Image.Image]:
    sprites = load_approved_garland_sprites(COMPONENTS)
    # The standing scene is lit by a warm golden interior. Pull the cool pink
    # and pure-white components gently toward coral and ivory while preserving
    # their photographed texture and transparent edges.
    for name in (
        "rose",
        "flowingRose",
        "jasmine",
        "lotus",
        "marigoldOrange",
        "marigoldYellow",
    ):
        source = ImageEnhance.Color(sprites[name].convert("RGBA")).enhance(0.90)
        red, green, blue, alpha = source.split()
        red = red.point([min(255, round(value * 1.02 + 2)) for value in range(256)])
        green = green.point([min(255, round(value + 1)) for value in range(256)])
        blue = blue.point([round(value * 0.94) for value in range(256)])
        sprites[name] = clear_transparent_rgb(
            Image.merge("RGBA", (red, green, blue, alpha))
        )
    return sprites


def build_garlands() -> dict[str, Image.Image]:
    sprites = load_garland_sprites()
    return {
        name: fit_garland(sprites, DANCING_GARLAND_SOCKET, design)
        for name, design in GARLAND_DESIGNS.items()
    }


def build_outfits(base: Image.Image):
    """Fit the complete standing outfit catalog through one shared interface."""
    fitted = {}
    for name, (_, _, source, design) in OUTFIT_CATALOG.items():
        if source is None:
            source_layer = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
        else:
            source_layer = isolate_outfit_composite(base, Image.open(source))
        if name in FITTED_OUTFITS:
            material_mask = Image.new("L", CANVAS, 0)
            draw = ImageDraw.Draw(material_mask)
            for index in FITTED_OUTFIT_REGION_INDICES:
                draw.polygon(DANCING_OUTFIT_SOCKET.garment_regions[index], fill=255)
            if name == "armor-royal":
                for polygon in ARMOR_SHOULDER_REGIONS:
                    draw.polygon(polygon, fill=255)
            source_layer.putalpha(
                ImageChops.multiply(source_layer.getchannel("A"), material_mask)
            )
            source_layer = clear_transparent_rgb(source_layer)
        fitted[name] = fit_outfit(
            base,
            source_layer,
            DANCING_OUTFIT_SOCKET,
            design=design,
        )
    return fitted


def build_trunk_occluder(base: Image.Image) -> Image.Image:
    mask = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(mask).polygon(
        [
            (point.x, point.y)
            for point in DANCING_GARLAND_SOCKET.occluder_polygon
        ],
        fill=255,
    )
    mask = ImageChops.multiply(mask, load_dancing_foreground_mask())
    layer = base.copy()
    layer.putalpha(ImageChops.multiply(base.getchannel("A"), mask))
    return clear_transparent_rgb(layer)


def build_fit_mask(layer: Image.Image) -> Image.Image:
    result = Image.new("RGBA", CANVAS, (255, 255, 255, 0))
    result.putalpha(layer.getchannel("A"))
    return clear_transparent_rgb(result)


def build_neutral_layer(base: Image.Image, point: Point | tuple[float, float]) -> Image.Image:
    """Return a validated no-op layer located inside its socket envelope."""
    x = round(point.x if isinstance(point, Point) else point[0])
    y = round(point.y if isinstance(point, Point) else point[1])
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.putpixel((x, y), base.getpixel((x, y)))
    return result


def build_thumbnail(layer: Image.Image) -> Image.Image:
    bounds = layer.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Cannot thumbnail an empty layer")
    visible = layer.crop(bounds)
    visible.thumbnail((224, 224), Image.Resampling.LANCZOS)
    result = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    result.alpha_composite(visible, ((256 - visible.width) // 2, (256 - visible.height) // 2))
    return clear_transparent_rgb(result)


def load_dancing_foreground_mask() -> Image.Image:
    foreground_mask = Image.open(DANCING_FOREGROUND_MASK_SOURCE).convert("L")
    if foreground_mask.size != CANVAS:
        raise ValueError(
            f"Dancing foreground mask must match {CANVAS}; got {foreground_mask.size}"
        )
    return foreground_mask


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False, compress_level=9)


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def rights(source: str) -> dict[str, object]:
    return {
        "author": "Ganpati Studio",
        "sourceAgreement": source,
        "aiAssisted": True,
    }


def review() -> dict[str, str]:
    return {"status": "pending", "reviewer": "", "date": ""}


def layer_entry(
    pack: Path,
    asset_id: str,
    file: str,
    z_index: int,
    occluded_by: list[str],
) -> dict[str, object]:
    return {
        "assetID": asset_id,
        "file": file,
        "frame": {"x": 0, "y": 0, "width": CANVAS[0], "height": CANVAS[1]},
        "zIndex": z_index,
        "blendMode": "normal",
        "occludedBy": occluded_by,
        "requires": [],
        "excludes": [],
        "contentHash": digest(pack / file),
        "rights": rights("Dancing Joy attachment pilot, 2026-08-14"),
    }


def garland_option(name: str, display_name: str, tags: list[str]) -> dict[str, object]:
    return {
        "optionID": f"garland.{name}.bal-dancing.v1",
        "slot": "garland",
        "socketID": "socket.garland.bal-dancing.v1",
        "displayName": display_name,
        "layerBindings": [
            {
                "role": "front",
                "assetID": f"garland.{name}.bal-dancing.front.v1",
            }
        ],
        "compatiblePostures": ["murti.bal-dancing.v1"],
        "thumbnail": f"thumbnails/garland-{name}-dancing.png",
        "referenceComposite": f"references/dancing-joy-garland-{name}.png",
        "collectionTags": [*tags, "dancing-joy"],
        "requires": ["posture:murti.bal-dancing.v1"],
        "excludes": [],
        "technicalReview": review(),
        "culturalReview": review(),
    }


def crown_option(name: str, display_name: str, tags: list[str]) -> dict[str, object]:
    reference = "dancing-joy-crown-only.png" if name == "royal" else f"dancing-joy-crown-{name}.png"
    return {
        "optionID": f"crown.{name}.bal-dancing.v1",
        "slot": "crown",
        "socketID": "socket.crown.bal-dancing.v1",
        "displayName": display_name,
        "layerBindings": [
            {
                "role": "front",
                "assetID": f"crown.{name}.bal-dancing.front.v1",
            }
        ],
        "compatiblePostures": ["murti.bal-dancing.v1"],
        "thumbnail": f"thumbnails/crown-{name}-dancing.png",
        "referenceComposite": f"references/{reference}",
        "collectionTags": [*tags, "dancing-joy"],
        "requires": ["posture:murti.bal-dancing.v1"],
        "excludes": [],
        "technicalReview": review(),
        "culturalReview": review(),
    }


def outfit_option(name: str, display_name: str, tags: list[str]) -> dict[str, object]:
    return {
        "optionID": f"outfit.{name}.bal-dancing.v1",
        "slot": "outfit",
        "socketID": "socket.outfit.bal-dancing.v1",
        "displayName": display_name,
        "layerBindings": [
            {
                "role": "front",
                "assetID": f"outfit.{name}.bal-dancing.front.v1",
            }
        ],
        "compatiblePostures": ["murti.bal-dancing.v1"],
        "thumbnail": f"thumbnails/outfit-{name}-dancing.png",
        "referenceComposite": f"references/dancing-joy-outfit-{name}.png",
        "collectionTags": [*tags, "dancing-joy"],
        "requires": ["posture:murti.bal-dancing.v1"],
        "excludes": [],
        "technicalReview": review(),
        "culturalReview": review(),
    }


def build_pack(output_dir: Path) -> None:
    """Build every Dancing Joy artifact behind one deterministic seam."""
    pack = Path(output_dir)
    for folder in ("layers", "fit-masks", "thumbnails", "references", "goldens"):
        (pack / folder).mkdir(parents=True, exist_ok=True)

    base = load_clean_base()
    crowns = build_crowns()
    garlands = build_garlands()
    outfits = build_outfits(base)
    celestial_scene = author_scene_variant(
        CELESTIAL_SCENE_SOURCE,
        CANVAS,
        canonical_base_source=CLEAN_BASE_SOURCE,
        foreground_mask_source=DANCING_FOREGROUND_MASK_SOURCE,
    )
    trunk = build_trunk_occluder(base)
    crown_none = build_neutral_layer(base, CROWN_SOCKET.anchor)
    garland_none = build_neutral_layer(base, DANCING_GARLAND_SOCKET.left_attachment)
    scene_original = build_neutral_layer(base, (0, 0))
    empty_thumbnail = Image.new("RGBA", (256, 256), (0, 0, 0, 0))

    save_png(base, pack / "layers/base.png")
    save_png(scene_original, pack / "layers/scene-original-dancing.png")
    save_png(celestial_scene.layer, pack / "layers/scene-celestial-aarti-dancing.png")
    save_png(crown_none, pack / "layers/crown-none-dancing.png")
    save_png(garland_none, pack / "layers/garland-none-dancing.png")
    for name, fitted in outfits.items():
        save_png(fitted.layer, pack / f"layers/outfit-{name}-dancing.png")
    for name, layer in garlands.items():
        save_png(layer, pack / f"layers/garland-{name}-dancing.png")
    save_png(trunk, pack / "layers/fixed-trunk-foreground.png")
    for name, layer in crowns.items():
        save_png(layer, pack / f"layers/crown-{name}-dancing.png")

    save_png(
        garland_fit_envelope(
            DANCING_GARLAND_SOCKET,
            strand_radius=64,
            drop_radius=80,
        ),
        pack / "fit-masks/garland-chest-zone.png",
    )
    crown_fit_zone = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    for crown in crowns.values():
        crown_fit_zone.alpha_composite(crown)
    save_png(build_fit_mask(crown_fit_zone), pack / "fit-masks/crown-head-zone.png")
    save_png(
        next(iter(outfits.values())).fit_mask,
        pack / "fit-masks/outfit-full-body-zone.png",
    )
    save_png(
        Image.new("RGBA", CANVAS, (255, 255, 255, 255)),
        pack / "fit-masks/scene-full-canvas-zone.png",
    )

    for name, layer in garlands.items():
        save_png(build_thumbnail(layer), pack / f"thumbnails/garland-{name}-dancing.png")
    for name, layer in crowns.items():
        save_png(build_thumbnail(layer), pack / f"thumbnails/crown-{name}-dancing.png")
    for name, fitted in outfits.items():
        save_png(fitted.thumbnail, pack / f"thumbnails/outfit-{name}-dancing.png")
    save_png(empty_thumbnail, pack / "thumbnails/none-dancing.png")
    save_png(
        ImageOps.fit(
            base,
            (256, 256),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.52),
        ),
        pack / "thumbnails/scene-original-dancing.png",
    )
    save_png(
        celestial_scene.thumbnail,
        pack / "thumbnails/scene-celestial-aarti-dancing.png",
    )

    save_png(base, pack / "references/dancing-joy-clean.png")
    save_png(base, pack / "references/dancing-joy-scene-original.png")
    save_png(
        celestial_scene.reference,
        pack / "references/dancing-joy-scene-celestial-aarti.png",
    )
    for name, crown in crowns.items():
        crown_composite = base.copy()
        crown_composite.alpha_composite(crown)
        reference = "dancing-joy-crown-only.png" if name == "royal" else f"dancing-joy-crown-{name}.png"
        save_png(crown_composite, pack / "references" / reference)
    for name, garland in garlands.items():
        garland_composite = base.copy()
        garland_composite.alpha_composite(garland)
        garland_composite.alpha_composite(trunk)
        save_png(
            garland_composite,
            pack / f"references/dancing-joy-garland-{name}.png",
        )
    for name, fitted in outfits.items():
        save_png(
            fitted.reference,
            pack / f"references/dancing-joy-outfit-{name}.png",
        )

    composite = base.copy()
    composite.alpha_composite(garlands["marigold"])
    composite.alpha_composite(trunk)
    composite.alpha_composite(crowns["royal"])
    save_png(composite, pack / "references/dancing-joy-crown-garland.png")

    frame = {"x": 0, "y": 0, "width": CANVAS[0], "height": CANVAS[1]}
    crown_socket = "socket.crown.bal-dancing.v1"
    garland_socket = "socket.garland.bal-dancing.v1"
    outfit_socket = "socket.outfit.bal-dancing.v1"
    scene_socket = "socket.scene.bal-dancing.v1"
    occluder_id = "fixed.trunk-foreground.bal-dancing.v1"
    layers = [
        layer_entry(pack, "fixed.bal-dancing-base.v1", "layers/base.png", 0, []),
        layer_entry(
            pack,
            "scene.original.bal-dancing.environment.v1",
            "layers/scene-original-dancing.png",
            1,
            [],
        ),
        layer_entry(
            pack,
            "scene.celestial-aarti.bal-dancing.environment.v1",
            "layers/scene-celestial-aarti-dancing.png",
            1,
            [],
        ),
        layer_entry(
            pack,
            "crown.none.bal-dancing.front.v1",
            "layers/crown-none-dancing.png",
            5,
            [],
        ),
        layer_entry(
            pack,
            "garland.none.bal-dancing.front.v1",
            "layers/garland-none-dancing.png",
            6,
            [occluder_id],
        ),
    ]
    layers.extend(
        layer_entry(
            pack,
            f"outfit.{name}.bal-dancing.front.v1",
            f"layers/outfit-{name}-dancing.png",
            7,
            [occluder_id],
        )
        for name in OUTFIT_CATALOG
    )
    layers.extend(
        layer_entry(
            pack,
            f"garland.{name}.bal-dancing.front.v1",
            f"layers/garland-{name}-dancing.png",
            10,
            [occluder_id],
        )
        for name in GARLAND_DESIGNS
    )
    layers.append(
        layer_entry(
            pack,
            occluder_id,
            "layers/fixed-trunk-foreground.png",
            20,
            [],
        )
    )
    layers.extend(
        layer_entry(
            pack,
            f"crown.{name}.bal-dancing.front.v1",
            f"layers/crown-{name}-dancing.png",
            30,
            [],
        )
        for name in CROWN_DESIGNS
    )

    manifest = {
        "schemaVersion": 2,
        "posture": {
            "id": "murti.bal-dancing.v1",
            "baseVersion": "1.5.3",
            "canvas": {"width": CANVAS[0], "height": CANVAS[1]},
            "coordinateOrigin": "topLeft",
            "fixedLayerAssetIDs": ["fixed.bal-dancing-base.v1", occluder_id],
            "supportedSlots": ["crown", "garland", "outfit", "scene"],
            "defaultSelections": {
                "crown": "crown.none.bal-dancing.v1",
                "garland": "garland.none.bal-dancing.v1",
                "outfit": "outfit.saffron.bal-dancing.v1",
                "scene": "scene.original.bal-dancing.v1",
            },
            "rights": rights("User-supplied base murti pilot, 2026-08-14"),
            "technicalReview": review(),
            "culturalReview": review(),
        },
        "sockets": [
            {
                "socketID": crown_socket,
                "slot": "crown",
                "anchor": {
                    "x": round(CROWN_SOCKET.anchor[0]),
                    "y": round(CROWN_SOCKET.anchor[1]),
                },
                "fitGeometry": CROWN_SOCKET.manifest_geometry(),
                "fitMask": {
                    "file": "fit-masks/crown-head-zone.png",
                    "frame": frame,
                    "contentHash": digest(pack / "fit-masks/crown-head-zone.png"),
                },
                "requiredLayerRoles": ["front"],
                "occluderLayerAssetIDs": [],
            },
            {
                "socketID": garland_socket,
                "slot": "garland",
                "anchor": {
                    # Match the Swift runtime's positive-coordinate midpoint
                    # rule: exact half pixels round upward, not banker's-even.
                    "x": int(DANCING_GARLAND_SOCKET.anchor.x + 0.5),
                    "y": int(DANCING_GARLAND_SOCKET.anchor.y + 0.5),
                },
                "fitGeometry": DANCING_GARLAND_SOCKET.manifest_geometry(),
                "fitMask": {
                    "file": "fit-masks/garland-chest-zone.png",
                    "frame": frame,
                    "contentHash": digest(pack / "fit-masks/garland-chest-zone.png"),
                },
                "requiredLayerRoles": ["front"],
                "occluderLayerAssetIDs": [occluder_id],
            },
            {
                "socketID": outfit_socket,
                "slot": "outfit",
                "anchor": {
                    "x": round(DANCING_OUTFIT_SOCKET.anchor[0]),
                    "y": round(DANCING_OUTFIT_SOCKET.anchor[1]),
                },
                "fitMask": {
                    "file": "fit-masks/outfit-full-body-zone.png",
                    "frame": frame,
                    "contentHash": digest(pack / "fit-masks/outfit-full-body-zone.png"),
                },
                "requiredLayerRoles": ["front"],
                "occluderLayerAssetIDs": [occluder_id],
            },
            {
                "socketID": scene_socket,
                "slot": "scene",
                "anchor": {"x": CANVAS[0] // 2, "y": CANVAS[1] // 2},
                "fitMask": {
                    "file": "fit-masks/scene-full-canvas-zone.png",
                    "frame": frame,
                    "contentHash": digest(pack / "fit-masks/scene-full-canvas-zone.png"),
                },
                "requiredLayerRoles": ["environment"],
                "occluderLayerAssetIDs": [],
            },
        ],
        "layers": layers,
        "optionGroups": [
            {
                "optionID": "crown.none.bal-dancing.v1",
                "slot": "crown",
                "socketID": crown_socket,
                "displayName": "No Crown",
                "layerBindings": [
                    {"role": "front", "assetID": "crown.none.bal-dancing.front.v1"}
                ],
                "compatiblePostures": ["murti.bal-dancing.v1"],
                "thumbnail": "thumbnails/none-dancing.png",
                "referenceComposite": "references/dancing-joy-clean.png",
                "collectionTags": ["none", "natural", "dancing-joy"],
                "requires": ["posture:murti.bal-dancing.v1"],
                "excludes": [],
                "technicalReview": review(),
                "culturalReview": review(),
            },
            *(
                crown_option(name, display_name, tags)
                for name, (display_name, tags) in CROWN_CATALOG.items()
            ),
            {
                "optionID": "garland.none.bal-dancing.v1",
                "slot": "garland",
                "socketID": garland_socket,
                "displayName": "No Garland",
                "layerBindings": [
                    {"role": "front", "assetID": "garland.none.bal-dancing.front.v1"}
                ],
                "compatiblePostures": ["murti.bal-dancing.v1"],
                "thumbnail": "thumbnails/none-dancing.png",
                "referenceComposite": "references/dancing-joy-clean.png",
                "collectionTags": ["none", "natural", "dancing-joy"],
                "requires": ["posture:murti.bal-dancing.v1"],
                "excludes": [],
                "technicalReview": review(),
                "culturalReview": review(),
            },
            garland_option("marigold", "Dancing Marigold Mala", ["marigold", "festival"]),
            garland_option("rose", "Dancing Rose Mala", ["rose", "jasmine", "temple"]),
            garland_option(
                "rose-flowing",
                "Dancing Flowing Rose Mala",
                ["rose", "flowing", "festive"],
            ),
            garland_option(
                "lotus-jasmine",
                "Dancing Lotus Jasmine Mala",
                ["lotus", "jasmine", "devotional"],
            ),
            *(
                outfit_option(name, display_name, tags)
                for name, (display_name, tags, _, _) in OUTFIT_CATALOG.items()
            ),
            {
                "optionID": "scene.original.bal-dancing.v1",
                "slot": "scene",
                "socketID": scene_socket,
                "displayName": "Original Shrine",
                "layerBindings": [
                    {
                        "role": "environment",
                        "assetID": "scene.original.bal-dancing.environment.v1",
                    }
                ],
                "compatiblePostures": ["murti.bal-dancing.v1"],
                "thumbnail": "thumbnails/scene-original-dancing.png",
                "referenceComposite": "references/dancing-joy-scene-original.png",
                "collectionTags": ["base", "home", "daylight", "dancing-joy"],
                "requires": ["posture:murti.bal-dancing.v1"],
                "excludes": [],
                "technicalReview": review(),
                "culturalReview": review(),
            },
            {
                "optionID": "scene.celestial-aarti.bal-dancing.v1",
                "slot": "scene",
                "socketID": scene_socket,
                "displayName": "Celestial Aarti",
                "layerBindings": [
                    {
                        "role": "environment",
                        "assetID": "scene.celestial-aarti.bal-dancing.environment.v1",
                    }
                ],
                "compatiblePostures": ["murti.bal-dancing.v1"],
                "thumbnail": "thumbnails/scene-celestial-aarti-dancing.png",
                "referenceComposite": "references/dancing-joy-scene-celestial-aarti.png",
                "collectionTags": [
                    "starry",
                    "festival",
                    "night",
                    "diya",
                    "dancing-joy",
                ],
                "requires": ["posture:murti.bal-dancing.v1"],
                "excludes": [],
                "technicalReview": review(),
                "culturalReview": review(),
            },
        ],
        "qa": {
            "highRiskPairs": [
                ["crown.royal.bal-dancing.v1", "garland.marigold.bal-dancing.v1"],
                ["crown.peacock.bal-dancing.v1", "garland.rose.bal-dancing.v1"],
                ["crown.flower.bal-dancing.v1", "garland.rose-flowing.bal-dancing.v1"],
                ["crown.blue-lotus.bal-dancing.v1", "garland.lotus-jasmine.bal-dancing.v1"],
                ["crown.royal.bal-dancing.v1", "outfit.armor-royal.bal-dancing.v1"],
                ["garland.rose.bal-dancing.v1", "outfit.teal.bal-dancing.v1"],
                ["garland.lotus-jasmine.bal-dancing.v1", "outfit.jewel-festival.bal-dancing.v1"],
            ]
        },
    }
    (pack / "manifest.v2.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    print(f"crown alphaBounds={crowns['royal'].getchannel('A').getbbox()}")
    print(f"garland alphaBounds={garlands['marigold'].getchannel('A').getbbox()}")
    print(f"attachments=({LEFT_ATTACH}, {RIGHT_ATTACH}), drop={DROP}")
    print(f"reference={pack / 'references/dancing-joy-crown-garland.png'}")


def main() -> None:
    build_pack(PACK)


if __name__ == "__main__":
    main()
