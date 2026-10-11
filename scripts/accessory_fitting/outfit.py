"""Fit authored outfit cutouts through one pose-owned socket.

The source cutout carries the visual design.  The socket carries the only
pose-specific knowledge: the garment envelope, identity-protection regions,
and the picker crop.  Difference isolation, edge recovery, clipping,
transparent-pixel cleanup, named-contact validation, preview composition, and
thumbnailing stay behind ``fit_outfit`` so pack builders cannot accumulate
per-outfit cleanup or fit-check recipes.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from PIL import Image, ImageChops, ImageDraw, ImageFilter


Point = tuple[float, float]
Polygon = tuple[Point, ...]
NamedPoint = tuple[str, Point]


@dataclass(frozen=True)
class OutfitSocket:
    """Pose-owned facts shared by every outfit fitted to one Base Murti."""

    canvas_size: tuple[int, int]
    anchor: Point
    garment_regions: tuple[Polygon, ...]
    protected_regions: tuple[Polygon, ...]
    thumbnail_crop: tuple[int, int, int, int]
    fit_points: tuple[NamedPoint, ...] = ()
    minimum_fit_points: int = 0
    fit_point_radius: int = 24

    def __post_init__(self) -> None:
        width, height = self.canvas_size
        if width <= 0 or height <= 0:
            raise ValueError("Outfit canvas dimensions must be positive")
        if not _point_is_valid(self.anchor, self.canvas_size):
            raise ValueError("Outfit anchor must remain inside the canonical canvas")
        if not self.garment_regions:
            raise ValueError("Outfit socket requires at least one garment region")
        for polygon in self.garment_regions + self.protected_regions:
            if len(polygon) < 3:
                raise ValueError("Outfit regions require at least three points")
            if any(not _point_is_valid(point, self.canvas_size) for point in polygon):
                raise ValueError("Outfit regions must remain inside the canonical canvas")

        names = [name for name, _ in self.fit_points]
        if any(not name for name in names) or len(names) != len(set(names)):
            raise ValueError("Outfit fit-point names must be nonempty and unique")
        if any(not _point_is_valid(point, self.canvas_size) for _, point in self.fit_points):
            raise ValueError("Outfit fit points must remain inside the canonical canvas")
        if not 0 <= self.minimum_fit_points <= len(self.fit_points):
            raise ValueError("Outfit minimum fit-point coverage is invalid")
        if self.fit_point_radius <= 0:
            raise ValueError("Outfit fit-point radius must be positive")

        left, top, right, bottom = self.thumbnail_crop
        if not (0 <= left < right <= width and 0 <= top < bottom <= height):
            raise ValueError("Outfit thumbnail crop must remain inside the canonical canvas")
        if self.fit_mask().getpixel((round(self.anchor[0]), round(self.anchor[1]))) == 0:
            raise ValueError("Outfit anchor must lie inside the usable garment envelope")

    def fit_mask(self) -> Image.Image:
        """Return the locked usable envelope in canonical-pixel space."""
        allowed = Image.new("L", self.canvas_size, 0)
        draw = ImageDraw.Draw(allowed)
        for polygon in self.garment_regions:
            draw.polygon(polygon, fill=255)

        protected = Image.new("L", self.canvas_size, 0)
        draw = ImageDraw.Draw(protected)
        for polygon in self.protected_regions:
            draw.polygon(polygon, fill=255)
        return ImageChops.multiply(allowed, ImageChops.invert(protected))

    def covered_fit_points(self, alpha: Image.Image) -> tuple[str, ...]:
        """Return named anatomical contacts occupied by a fitted garment."""
        if alpha.size != self.canvas_size:
            raise ValueError("Outfit alpha must use the canonical canvas")
        radius = self.fit_point_radius
        width, height = self.canvas_size
        covered = []
        for name, (x, y) in self.fit_points:
            bounds = (
                max(0, round(x) - radius),
                max(0, round(y) - radius),
                min(width, round(x) + radius + 1),
                min(height, round(y) + radius + 1),
            )
            if alpha.crop(bounds).getbbox() is not None:
                covered.append(name)
        return tuple(covered)

    def manifest_geometry(self) -> dict[str, object]:
        """Expose the reviewed pose contacts without leaking fit implementation."""
        return {
            "fitPoints": [
                {"name": name, "x": round(point[0]), "y": round(point[1])}
                for name, point in self.fit_points
            ],
            "minimumFitPoints": self.minimum_fit_points,
            "fitPointRadius": self.fit_point_radius,
        }


@dataclass(frozen=True)
class OutfitDesign:
    """Source-normalization facts independent of the target pose envelope."""

    wearable_anchor: Point
    scale: float = 1.0

    def __post_init__(self) -> None:
        if not all(isfinite(coordinate) for coordinate in self.wearable_anchor):
            raise ValueError("Outfit wearable anchor must have finite coordinates")
        if not isfinite(self.scale) or self.scale <= 0:
            raise ValueError("Outfit source scale must be positive and finite")


@dataclass(frozen=True)
class FittedOutfit:
    """All deterministic artifacts produced at the outfit module's seam."""

    layer: Image.Image
    reference: Image.Image
    thumbnail: Image.Image
    fit_mask: Image.Image
    covered_fit_points: tuple[str, ...]


def isolate_outfit_composite(base: Image.Image, composite: Image.Image) -> Image.Image:
    """Recover canonical outfit pixels from a dressed Base Murti composite.

    Both images already share the pose-owned canvas, so the recovered layer
    must remain in those coordinates. A soft difference matte rejects minor
    generator drift while retaining antialiased garment boundaries.
    """
    if base.size != composite.size:
        raise ValueError("Outfit base and composite must use the same canvas")

    difference = ImageChops.difference(base.convert("RGB"), composite.convert("RGB"))
    red, green, blue = difference.split()
    maximum_difference = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    alpha = maximum_difference.point(
        [max(0, min(255, round((pixel - 40) * 255 / 20))) for pixel in range(256)]
    )
    alpha = alpha.filter(ImageFilter.MaxFilter(5)).filter(
        ImageFilter.GaussianBlur(1.15)
    )

    layer = composite.convert("RGBA")
    layer.putalpha(alpha)
    return _clear_transparent_rgb(layer)


def fit_outfit(
    base: Image.Image,
    source_layer: Image.Image,
    socket: OutfitSocket,
    design: OutfitDesign | None = None,
) -> FittedOutfit:
    """Return a snug canonical layer and its derived authoring artifacts.

    Passing an empty transparent ``source_layer`` creates the neutral Variant.
    It renders one identity-preserving pixel so the runtime can still validate
    a nonempty swappable layer while the reference stays unchanged.
    """
    if base.size != socket.canvas_size or source_layer.size != socket.canvas_size:
        width, height = socket.canvas_size
        raise ValueError(f"Outfit inputs must be {width}x{height} pixels")

    source_rgb = source_layer.convert("RGB")
    if "A" in source_layer.getbands():
        alpha = source_layer.getchannel("A")
    else:
        # Some raster generators flatten their transparency preview onto a
        # neutral checkerboard. Recover the cutout from the color/darkness
        # distance to that backdrop in one place instead of teaching every pack
        # builder about the generator's transport quirk.
        _, saturation, value = source_rgb.convert("HSV").split()
        chroma_alpha = saturation.point(
            [max(0, min(255, round((pixel - 8) * 255 / 36))) for pixel in range(256)]
        )
        dark_alpha = value.point(
            [max(0, min(255, round((232 - pixel) * 255 / 42))) for pixel in range(256)]
        )
        alpha = ImageChops.lighter(chroma_alpha, dark_alpha)
        alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(
            ImageFilter.GaussianBlur(0.45)
        )

    source_rgba = source_rgb.convert("RGBA")
    source_rgba.putalpha(alpha)
    source_rgba = _clear_transparent_rgb(source_rgba)
    design = design or OutfitDesign(wearable_anchor=socket.anchor)
    inverse_scale = 1 / design.scale
    source_x, source_y = design.wearable_anchor
    target_x, target_y = socket.anchor
    layer = source_rgba.transform(
        socket.canvas_size,
        Image.Transform.AFFINE,
        (
            inverse_scale,
            0,
            source_x - inverse_scale * target_x,
            0,
            inverse_scale,
            source_y - inverse_scale * target_y,
        ),
        resample=Image.Resampling.BICUBIC,
        fillcolor=(0, 0, 0, 0),
    )
    fit_mask = socket.fit_mask()
    alpha = ImageChops.multiply(layer.getchannel("A"), fit_mask)

    layer.putalpha(alpha)
    covered_fit_points = socket.covered_fit_points(alpha)
    if alpha.getbbox() is not None and len(covered_fit_points) < socket.minimum_fit_points:
        missing = socket.minimum_fit_points - len(covered_fit_points)
        raise ValueError(
            f"Outfit misses {missing} required pose fit point(s); "
            f"covered {covered_fit_points or 'none'}"
        )
    if alpha.getbbox() is None:
        x, y = round(socket.anchor[0]), round(socket.anchor[1])
        layer.putpixel((x, y), base.convert("RGBA").getpixel((x, y)))
    layer = _clear_transparent_rgb(layer)

    reference = base.convert("RGBA")
    reference.alpha_composite(layer)
    thumbnail = reference.crop(socket.thumbnail_crop).resize(
        (256, 256),
        Image.Resampling.LANCZOS,
    )
    mask_rgba = Image.new("RGBA", socket.canvas_size, (255, 255, 255, 0))
    mask_rgba.putalpha(fit_mask)

    return FittedOutfit(
        layer=layer,
        reference=_clear_transparent_rgb(reference),
        thumbnail=thumbnail.convert("RGBA"),
        fit_mask=_clear_transparent_rgb(mask_rgba),
        covered_fit_points=covered_fit_points,
    )


def _point_is_valid(point: Point, canvas_size: tuple[int, int]) -> bool:
    width, height = canvas_size
    return (
        all(isfinite(coordinate) for coordinate in point)
        and 0 <= point[0] < width
        and 0 <= point[1] < height
    )


def _clear_transparent_rgb(image: Image.Image) -> Image.Image:
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
