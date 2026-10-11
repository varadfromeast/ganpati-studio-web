#!/usr/bin/env python3
"""Fit isolated Modak candidates to the locked Bal Ganpati hand socket."""

from pathlib import Path
import shutil

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/staging/cute/offerings"
OUTPUT = SOURCE / "fitted"
PREVIEWS = OUTPUT / "previews"
BASE = ROOT / "assets/runtime/cute/cute-bal-ganpati-base-v1.png"
PACK = ROOT / "assets/packs/bal-seated-crowns-v2"
CANVAS = (941, 1672)

# name: (target width, top-left x, top-left y)
FITS = {
    "classic-modak-v1": (116, 595, 932),
    "kesar-modak-v1": (116, 595, 932),
    "rose-modak-v1": (116, 595, 932),
}

PACK_NAMES = {
    "classic-modak-v1": "offering-classic",
    "kesar-modak-v1": "offering-kesar",
    "rose-modak-v1": "offering-rose",
}


def finger_occluder(base: Image.Image) -> Image.Image:
    """Extract the canonical gripping fingers without repainting their pixels."""
    polygon = [
        (580, 1032), (596, 1018), (618, 1023), (638, 1036),
        (660, 1034), (683, 1027), (705, 1013), (726, 1024),
        (735, 1048), (722, 1077), (695, 1097), (654, 1108),
        (615, 1098), (589, 1078),
    ]
    region = Image.new("L", CANVAS, 0)
    ImageDraw.Draw(region).polygon(polygon, fill=255)
    pixels = base.load()
    region_pixels = region.load()
    mask = Image.new("L", CANVAS, 0)
    mask_pixels = mask.load()
    for y in range(1008, 1112):
        for x in range(576, 740):
            if not region_pixels[x, y]:
                continue
            red, green, blue, _ = pixels[x, y]
            if red > 145 and green < 170 and red - green > 58 and red - blue > 72:
                mask_pixels[x, y] = 255
    mask = mask.filter(ImageFilter.MaxFilter(3))
    # The Base Murti bakes the original sweet into the palm. Keep only the
    # lower gripping fingers so none of those cream pixels can reappear over a
    # colored replacement.
    ImageDraw.Draw(mask).rectangle((590, 1008, 720, 1054), fill=0)
    mask = mask.filter(ImageFilter.GaussianBlur(0.55))
    result = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    result.paste(base, (0, 0), mask)
    result.putalpha(mask)
    return result


def fit(name: str, target_width: int, x: int, y: int) -> None:
    source = Image.open(SOURCE / f"{name}.png").convert("RGBA")
    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"{name} has no visible alpha")
    visible = source.crop(bounds)
    target_height = round(visible.height * target_width / visible.width)
    fitted = visible.resize((target_width, target_height), Image.Resampling.LANCZOS)
    if x < 0 or y < 0 or x + target_width > CANVAS[0] or y + target_height > CANVAS[1]:
        raise ValueError(f"{name} placement exceeds the canonical canvas")

    canvas = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    canvas.alpha_composite(fitted, (x, y))
    OUTPUT.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT / f"{name}-canvas.png", optimize=False, compress_level=9)

    base = Image.open(BASE).convert("RGBA")
    fingers = finger_occluder(base)
    preview = base.copy()
    preview.alpha_composite(canvas)
    preview.alpha_composite(fingers)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    preview.convert("RGB").save(PREVIEWS / f"{name}.jpg", quality=92)

    pack_name = PACK_NAMES[name]
    for directory in (PACK / "layers", PACK / "thumbnails", PACK / "references"):
        directory.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUTPUT / f"{name}-canvas.png", PACK / "layers" / f"{pack_name}.png")

    thumbnail = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    thumb_visible = fitted.copy()
    thumb_visible.thumbnail((214, 214), Image.Resampling.LANCZOS)
    thumbnail.alpha_composite(
        thumb_visible,
        ((256 - thumb_visible.width) // 2, (256 - thumb_visible.height) // 2),
    )
    thumbnail.save(PACK / "thumbnails" / f"{pack_name}.png", optimize=False, compress_level=9)
    preview.save(PACK / "references" / f"{pack_name}.png", optimize=False, compress_level=9)
    print(f"{name}: frame=({x},{y},{target_width},{target_height})")


def main() -> None:
    base = Image.open(BASE).convert("RGBA")
    fingers = finger_occluder(base)
    fingers.save(PACK / "layers" / "fixed-offering-fingers.png", optimize=False, compress_level=9)
    union_alpha = Image.new("L", CANVAS, 0)
    for name, values in FITS.items():
        fit(name, *values)
        layer = Image.open(PACK / "layers" / f"{PACK_NAMES[name]}.png").convert("RGBA")
        union_alpha = ImageChops.lighter(union_alpha, layer.getchannel("A"))
    fit_mask = Image.new("RGBA", CANVAS, (255, 255, 255, 0))
    fit_mask.putalpha(union_alpha)
    fit_mask.save(PACK / "fit-masks" / "offering-hand-zone.png", optimize=False, compress_level=9)


if __name__ == "__main__":
    main()
