"""Author full-canvas scene variants behind one deterministic interface."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter, ImageOps


@dataclass(frozen=True)
class AuthoredScene:
    """All runtime and review artifacts derived from one approved scene source."""

    layer: Image.Image
    thumbnail: Image.Image
    reference: Image.Image


def author_scene_variant(
    background_source: Path,
    canvas_size: tuple[int, int],
    *,
    canonical_base_source: Path,
    foreground_mask_source: Path,
) -> AuthoredScene:
    """Build a scene while preserving the canonical Base Murti geometry.

    The generated source is authoritative only for the environment. The Base
    Murti and its registered foreground mask remain authoritative for every
    protected subject pixel, preventing a background edit from moving,
    rescaling, or reinterpreting the murti beneath fitted foreground layers.
    """
    background = Image.open(background_source).convert("RGBA")
    canonical_base = Image.open(canonical_base_source).convert("RGBA")
    foreground_mask = Image.open(foreground_mask_source).convert("L")
    for role, image in (
        ("background", background),
        ("canonical Base Murti", canonical_base),
        ("foreground mask", foreground_mask),
    ):
        if image.size == canvas_size:
            continue
        raise ValueError(
            f"Scene {role} must match the canonical {canvas_size} canvas; "
            f"got {image.size}"
        )

    if background.getchannel("A").getextrema() != (255, 255):
        raise ValueError("Scene background must be fully opaque")
    if canonical_base.getchannel("A").getextrema() != (255, 255):
        raise ValueError("Canonical Base Murti source must be fully opaque")
    if foreground_mask.getbbox() is None:
        raise ValueError("Canonical Base Murti foreground mask must not be empty")

    # The authored mask is a locked, pixel-accurate silhouette. Collapse any
    # review antialiasing at half opacity and add only a narrow render feather.
    # Eroding this contour clips anatomy; expanding it retains the old daylight
    # plate as duplicate-looking limb and ear echoes on dark scenes.
    geometry_mask = foreground_mask.point(
        lambda value: 255 if value >= 128 else 0
    )
    matte_mask = geometry_mask.filter(ImageFilter.GaussianBlur(0.7))
    layer = Image.composite(canonical_base, background, matte_mask)

    # Every fully protected interior pixel must remain byte-identical to the
    # canonical source. The narrow transition band intentionally blends with
    # the authored environment.
    protected_mask = matte_mask.point(lambda value: 255 if value == 255 else 0)
    difference = ImageChops.difference(layer, canonical_base).convert("RGB")
    protected_difference = Image.composite(
        difference,
        Image.new("RGB", canvas_size, "black"),
        protected_mask,
    )
    if protected_difference.getbbox() is not None:
        raise ValueError("Scene changed protected canonical Base Murti pixels")

    red, green, blue, _ = layer.getpixel((0, 0))
    layer.putpixel((0, 0), (red, green, blue, 254))
    thumbnail = ImageOps.fit(
        layer,
        (256, 256),
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.52),
    )
    return AuthoredScene(
        layer=layer,
        thumbnail=thumbnail,
        reference=layer.copy(),
    )
