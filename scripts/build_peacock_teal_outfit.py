#!/usr/bin/env python3
"""Build the identity-safe Peacock Teal outfit from the canonical base.

The approved base already owns the correct sash and dhoti geometry. This build
only remaps the rose textile pixels to teal, retaining the original folds,
lighting, gold border, embroidery, anatomy, and occlusion boundaries.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter


CANVAS = (941, 1672)

# Broad authoring envelopes. The HSV textile key below supplies the exact edge;
# these polygons only prevent similarly colored flowers and skin from entering.
SASH_ENVELOPES = (
    (
        (526, 790), (615, 810), (625, 912), (596, 1015), (552, 1103),
        (470, 1168), (365, 1173), (286, 1110), (300, 1030), (386, 1054),
        (475, 1088), (520, 1000),
    ),
    (
        (500, 1065), (608, 1075), (683, 1130), (786, 1193), (778, 1288),
        (678, 1280), (600, 1225), (540, 1168),
    ),
)

# These Base Murti regions always remain in front of an outfit. Keeping them
# out of the generated layer prevents saturated peach/red contour pixels from
# being mistaken for the source rose textile.
FACE_AND_EAR_PROTECTION = (
    ((495, 700), (556, 700), (585, 765), (575, 805), (548, 830), (510, 818), (492, 775)),
    ((582, 635), (742, 646), (774, 730), (754, 816), (684, 875), (630, 895), (605, 850), (590, 800)),
)


def clear_transparent_rgb(image: Image.Image) -> Image.Image:
    pixels = np.asarray(image.convert("RGBA")).copy()
    pixels[pixels[:, :, 3] == 0, :3] = 0
    return Image.fromarray(pixels, mode="RGBA")


def build_thumbnail(reference: Image.Image) -> Image.Image:
    # Match the existing outfit picker: a square torso-and-legs crop.
    crop = reference.crop((190, 746, 751, 1307))
    return crop.resize((256, 256), Image.Resampling.LANCZOS).convert("RGBA")


def identity_protection_mask(trunk_path: Path) -> Image.Image:
    protected = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(protected)
    for polygon in FACE_AND_EAR_PROTECTION:
        draw.polygon(polygon, fill=255)

    trunk = Image.open(trunk_path).convert("RGBA")
    if trunk.size != CANVAS:
        raise ValueError(f"Trunk occluder must be {CANVAS[0]}x{CANVAS[1]} pixels")
    # Own the antialiased contour as well as the opaque center of the trunk.
    trunk_alpha = trunk.getchannel("A").filter(ImageFilter.MaxFilter(17))
    trunk_alpha = trunk_alpha.point(lambda value: 255 if value else 0)
    return ImageChops.lighter(protected, trunk_alpha)


def build(
    base_path: Path,
    trunk_path: Path,
    layer_path: Path,
    reference_path: Path,
    thumbnail_path: Path,
) -> None:
    base = Image.open(base_path).convert("RGB")
    if base.size != CANVAS:
        raise ValueError(f"Base must be {CANVAS[0]}x{CANVAS[1]} pixels")

    envelope = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(envelope)
    for polygon in SASH_ENVELOPES:
        draw.polygon(polygon, fill=255)
    protected = identity_protection_mask(trunk_path)

    hsv = np.asarray(base.convert("HSV")).copy()
    hue = hsv[:, :, 0]
    saturation = hsv[:, :, 1]
    value = hsv[:, :, 2]
    envelope_pixels = np.asarray(envelope) > 0
    protected_pixels = np.asarray(protected) > 0
    identity_contour = protected_pixels & (hue <= 13)

    # Rose/magenta textile key. The high saturation floor excludes skin while
    # leaving gold embroidery and piping under their canonical colors.
    rose_textile = (
        envelope_pixels
        & (saturation >= 150)
        & ((hue <= 13) | (hue >= 235))
        & (value >= 42)
        & ~identity_contour
    )

    recolored_hsv = hsv.copy()
    # A restrained peacock teal with the base textile's luminance and folds.
    # Slight hue variation keeps highlights from looking like a flat tint.
    red_offset = np.where(hue <= 13, hue, hue.astype(np.int16) - 255)
    recolored_hsv[:, :, 0] = np.clip(126 + red_offset // 3, 121, 130).astype(np.uint8)
    recolored_hsv[:, :, 1] = np.maximum(
        165, (saturation.astype(np.float32) * 0.92).astype(np.uint8)
    )
    recolored_hsv[:, :, 2] = np.maximum(
        40, (value.astype(np.float32) * 0.70).astype(np.uint8)
    )
    recolored = np.asarray(Image.fromarray(recolored_hsv, mode="HSV").convert("RGB"))

    composite_pixels = np.asarray(base).copy()
    composite_pixels[rose_textile] = recolored[rose_textile]
    reference = Image.fromarray(composite_pixels, mode="RGB")

    alpha = Image.fromarray((rose_textile.astype(np.uint8) * 255), mode="L")
    alpha = alpha.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.45))
    contour_mask = Image.fromarray((identity_contour.astype(np.uint8) * 255), mode="L")
    alpha = ImageChops.multiply(alpha, ImageChops.invert(contour_mask))
    layer = reference.convert("RGBA")
    layer.putalpha(alpha)
    layer = clear_transparent_rgb(layer)

    for path in (layer_path, reference_path, thumbnail_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    layer.save(layer_path, optimize=False, compress_level=9)
    reference.save(reference_path, optimize=False, compress_level=9)
    build_thumbnail(reference).save(thumbnail_path, optimize=False, compress_level=9)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--trunk", type=Path, required=True)
    parser.add_argument("--layer", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--thumbnail", type=Path, required=True)
    args = parser.parse_args()
    build(args.base, args.trunk, args.layer, args.reference, args.thumbnail)


if __name__ == "__main__":
    main()
