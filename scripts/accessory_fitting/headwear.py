"""Fit reusable headwear artwork to a pose-specific anatomical socket.

Callers describe the murti with stable anatomical landmarks and each silhouette
with one ``HeadwearDesign``. Cropping, tilt, scale, aspect-ratio preservation,
centering, placement, and transparent-pixel normalization remain implementation
details of this module.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, cos, degrees, hypot, isfinite, pi, sin

from PIL import Image


Point = tuple[float, float]


@dataclass(frozen=True)
class HeadwearSocket:
    """The pose-owned facts needed to fit every headwear silhouette."""

    canvas_size: tuple[int, int]
    left_temple: Point
    right_temple: Point
    hairline_center: Point
    apex: Point
    left_ear_top: Point
    right_ear_top: Point
    tilak_top: Point

    def __post_init__(self) -> None:
        width, height = self.canvas_size
        if width <= 0 or height <= 0:
            raise ValueError("Headwear canvas dimensions must be positive")

        landmarks = (
            self.left_temple,
            self.right_temple,
            self.hairline_center,
            self.apex,
            self.left_ear_top,
            self.right_ear_top,
            self.tilak_top,
        )
        if any(
            not all(isfinite(coordinate) for coordinate in point)
            for point in landmarks
        ):
            raise ValueError("Headwear landmarks must have finite coordinates")
        if any(
            not (0 <= point[0] < width and 0 <= point[1] < height)
            for point in landmarks
        ):
            raise ValueError("Headwear landmarks must remain inside the canonical canvas")
        if self.left_temple[0] >= self.right_temple[0]:
            raise ValueError("Headwear left temple must precede right temple")
        if self.left_ear_top[0] >= self.right_ear_top[0]:
            raise ValueError("Headwear left ear top must precede right ear top")
        if not self.left_temple[0] < self.hairline_center[0] < self.right_temple[0]:
            raise ValueError("Headwear hairline center must lie between both temples")
        if not self.left_temple[0] < self.tilak_top[0] < self.right_temple[0]:
            raise ValueError("Headwear tilak top must lie between both temples")
        if self.apex[1] >= self.hairline_center[1]:
            raise ValueError("Headwear apex must lie above the hairline center")
        if self.tilak_top[1] <= self.hairline_center[1]:
            raise ValueError("Headwear tilak top must lie below the hairline center")
        if self.lower_rim_y >= height:
            raise ValueError("Headwear lower rim must remain inside the canonical canvas")

    @property
    def anchor(self) -> Point:
        """Stable placement anchor shared by fitting and the pack manifest."""
        return self.hairline_center

    @property
    def rotation_degrees(self) -> float:
        """Counter-rotate artwork onto the pose's temple line."""
        run = self.right_temple[0] - self.left_temple[0]
        rise = self.left_temple[1] - self.right_temple[1]
        return degrees(atan2(rise, run))

    @property
    def target_width(self) -> int:
        """Span the head without making callers tune a scale per silhouette."""
        return round(
            hypot(
                self.right_ear_top[0] - self.left_ear_top[0],
                self.right_ear_top[1] - self.left_ear_top[1],
            )
        )

    @property
    def lower_rim_y(self) -> int:
        # A small overlap makes the band read as worn instead of floating. It is
        # a fitting rule, not pose-specific authoring data.
        return round(max(self.left_temple[1], self.right_temple[1]) + 42)

    def manifest_geometry(self) -> dict[str, object]:
        """Record the same locked geometry that produced the fitted pixels."""

        def point(value: Point) -> dict[str, int]:
            return {"x": round(value[0]), "y": round(value[1])}

        return {
            "model": "tiltedHeadwearFitV1",
            "coordinateSpace": "canonicalPixelsTopLeft",
            "landmarks": {
                "leftTemple": point(self.left_temple),
                "rightTemple": point(self.right_temple),
                "hairlineCenter": point(self.hairline_center),
                "apex": point(self.apex),
            },
            "authoredRotationDegrees": round(self.rotation_degrees, 6),
            "authoringTuning": {
                "status": "locked",
                "policy": "anatomicalLandmarksPreserveSilhouetteV1",
            },
            "clearance": {
                "tilakTop": point(self.tilak_top),
                "leftEarTop": point(self.left_ear_top),
                "rightEarTop": point(self.right_ear_top),
            },
        }


@dataclass(frozen=True)
class WearableBand:
    """Crown-local landmarks measured from its alpha-cropped top-left."""

    left_endpoint: Point
    center_lower_rim: Point
    right_endpoint: Point

    def __post_init__(self) -> None:
        points = (self.left_endpoint, self.center_lower_rim, self.right_endpoint)
        if any(
            not all(isfinite(coordinate) for coordinate in point) for point in points
        ):
            raise ValueError("Headwear band landmarks must have finite coordinates")
        if self.left_endpoint[0] >= self.right_endpoint[0]:
            raise ValueError("Headwear band left endpoint must precede right endpoint")
        if not (
            self.left_endpoint[0]
            <= self.center_lower_rim[0]
            <= self.right_endpoint[0]
        ):
            raise ValueError("Headwear band center must lie between both endpoints")

    @property
    def circumference_width(self) -> float:
        return hypot(
            self.right_endpoint[0] - self.left_endpoint[0],
            self.right_endpoint[1] - self.left_endpoint[1],
        )

    @property
    def angle_degrees(self) -> float:
        return degrees(
            atan2(
                self.left_endpoint[1] - self.right_endpoint[1],
                self.right_endpoint[0] - self.left_endpoint[0],
            )
        )


@dataclass(frozen=True)
class HeadwearDesign:
    """Silhouette-owned fitting facts, independent of a particular pose."""

    wearable_band: WearableBand | None = None
    width_factor: float = 1.0
    vertical_lift: float = 0.0

    def __post_init__(self) -> None:
        if not isfinite(self.width_factor) or self.width_factor <= 0:
            raise ValueError("Headwear width factor must be positive and finite")
        if not isfinite(self.vertical_lift) or self.vertical_lift < 0:
            raise ValueError("Headwear vertical lift must be non-negative and finite")


def fit_headwear(
    source: Image.Image,
    socket: HeadwearSocket,
    design: HeadwearDesign = HeadwearDesign(),
) -> Image.Image:
    """Return a canonical-canvas layer fitted to ``socket``."""
    source = _alpha_crop(source)
    if design.wearable_band is not None:
        return _fit_from_wearable_band(
            source,
            socket,
            design,
        )

    source_aspect = source.height / source.width
    fitted = source.rotate(
        socket.rotation_degrees,
        resample=Image.Resampling.BICUBIC,
        expand=True,
    )
    fitted = _alpha_crop(fitted)
    target_width = max(1, round(socket.target_width * design.width_factor))
    fitted = fitted.resize(
        (target_width, max(1, round(target_width * source_aspect))),
        Image.Resampling.LANCZOS,
    )
    fitted = _alpha_crop(fitted)

    x = round(socket.anchor[0] - fitted.width / 2)
    y = round(socket.lower_rim_y - design.vertical_lift - fitted.height)
    layer = Image.new("RGBA", socket.canvas_size, (0, 0, 0, 0))
    layer.alpha_composite(fitted, (x, y))
    return _clear_transparent_rgb(layer)


def _fit_from_wearable_band(
    source: Image.Image,
    socket: HeadwearSocket,
    design: HeadwearDesign,
) -> Image.Image:
    band = design.wearable_band
    assert band is not None

    scale = socket.target_width * design.width_factor / band.circumference_width
    angle = socket.rotation_degrees - band.angle_degrees
    radians = angle * pi / 180.0
    cosine = cos(radians)
    sine = sin(radians)
    target_x = socket.anchor[0]
    target_y = socket.anchor[1] - design.vertical_lift
    source_x, source_y = band.center_lower_rim

    # Pillow's affine coefficients map destination pixels back into the source.
    a = cosine / scale
    b = -sine / scale
    d = sine / scale
    e = cosine / scale
    c = source_x - a * target_x - b * target_y
    f = source_y - d * target_x - e * target_y
    layer = source.transform(
        socket.canvas_size,
        Image.Transform.AFFINE,
        (a, b, c, d, e, f),
        resample=Image.Resampling.BICUBIC,
        fillcolor=(0, 0, 0, 0),
    )
    return _clear_transparent_rgb(layer)


def _alpha_crop(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Headwear source has no visible pixels")
    return _clear_transparent_rgb(image.crop(bounds))


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
