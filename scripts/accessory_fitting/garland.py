"""Fit component-built malas to a pose-specific anatomical socket.

Callers describe anatomy once with ``GarlandSocket`` and provide only artwork
rhythm with ``GarlandDesign``. Cubic evaluation, equal-arc sampling, endpoint
ownership, tangent alignment, tapering, and transparent-pixel cleanup stay
inside this module.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from math import atan2, degrees, hypot, pi, sin

from PIL import Image, ImageDraw, ImageFilter


@dataclass(frozen=True)
class Point:
    x: float
    y: float

    def distance(self, other: "Point") -> float:
        return hypot(self.x - other.x, self.y - other.y)


@dataclass(frozen=True)
class Centerpiece:
    sprite_name: str
    width: float
    offset: Point = Point(0, 0)


@dataclass(frozen=True)
class GarlandDesign:
    sprite_sequence: tuple[str, ...]
    spacing: float
    widths: tuple[float, ...]
    thread_width: int
    phase: float = 0.0
    centerpiece: Centerpiece | None = None
    shadow_offset: Point = Point(0, 0)
    shadow_blur: float = 0.0
    shadow_opacity: float = 0.0

    def __post_init__(self) -> None:
        if not self.sprite_sequence:
            raise ValueError("Garland sprite sequence must not be empty")
        if len(self.sprite_sequence) != len(self.widths):
            raise ValueError("Garland sprite sequence and widths must have equal length")
        if self.spacing <= 0:
            raise ValueError("Garland spacing must be positive")
        if any(width <= 0 for width in self.widths):
            raise ValueError("Garland sprite widths must be positive")
        if self.thread_width <= 0:
            raise ValueError("Garland thread width must be positive")
        if self.centerpiece is not None and self.centerpiece.width <= 0:
            raise ValueError("Garland centerpiece width must be positive")
        if self.shadow_blur < 0:
            raise ValueError("Garland shadow blur must not be negative")
        if not 0 <= self.shadow_opacity <= 1:
            raise ValueError("Garland shadow opacity must be between 0 and 1")


@dataclass(frozen=True)
class _CubicBezier:
    start: Point
    control1: Point
    control2: Point
    end: Point

    def point(self, t: float) -> Point:
        u = 1.0 - t
        return Point(
            u**3 * self.start.x
            + 3 * u**2 * t * self.control1.x
            + 3 * u * t**2 * self.control2.x
            + t**3 * self.end.x,
            u**3 * self.start.y
            + 3 * u**2 * t * self.control1.y
            + 3 * u * t**2 * self.control2.y
            + t**3 * self.end.y,
        )

    def tangent(self, t: float) -> Point:
        u = 1.0 - t
        return Point(
            3 * u**2 * (self.control1.x - self.start.x)
            + 6 * u * t * (self.control2.x - self.control1.x)
            + 3 * t**2 * (self.end.x - self.control2.x),
            3 * u**2 * (self.control1.y - self.start.y)
            + 6 * u * t * (self.control2.y - self.control1.y)
            + 3 * t**2 * (self.end.y - self.control2.y),
        )


@dataclass(frozen=True)
class GarlandSocket:
    canvas_size: tuple[int, int]
    left_attachment: Point
    right_attachment: Point
    center_drop: Point
    left_controls: tuple[Point, Point]
    right_controls: tuple[Point, Point]
    occluder_polygon: tuple[Point, ...]
    endpoint_taper: float = 0.68

    def __post_init__(self) -> None:
        width, height = self.canvas_size
        if width <= 0 or height <= 0:
            raise ValueError("Garland canvas dimensions must be positive")
        points = (
            self.left_attachment,
            self.right_attachment,
            self.center_drop,
            *self.left_controls,
            *self.right_controls,
            *self.occluder_polygon,
        )
        if any(not (0 <= point.x < width and 0 <= point.y < height) for point in points):
            raise ValueError("Garland geometry must remain inside its canonical canvas")
        if self.left_attachment.x >= self.right_attachment.x:
            raise ValueError("Garland left attachment must precede right attachment")
        if not self.left_attachment.x < self.center_drop.x < self.right_attachment.x:
            raise ValueError("Garland center drop must lie between both attachments")
        if self.center_drop.y <= max(self.left_attachment.y, self.right_attachment.y):
            raise ValueError("Garland center drop must lie below both attachments")
        if len(self.left_controls) != 2 or len(self.right_controls) != 2:
            raise ValueError("Garland paths require exactly two controls per side")
        if len(self.occluder_polygon) < 3:
            raise ValueError("Garland occluder polygon requires at least three points")
        if not 0 < self.endpoint_taper <= 1:
            raise ValueError("Garland endpoint taper must be in (0, 1]")

    @property
    def anchor(self) -> Point:
        return Point(
            (self.left_attachment.x + self.right_attachment.x) / 2,
            (self.left_attachment.y + self.right_attachment.y) / 2,
        )

    @property
    def paths(self) -> tuple[_CubicBezier, _CubicBezier]:
        return (
            _CubicBezier(
                self.left_attachment,
                self.left_controls[0],
                self.left_controls[1],
                self.center_drop,
            ),
            _CubicBezier(
                self.right_attachment,
                self.right_controls[0],
                self.right_controls[1],
                self.center_drop,
            ),
        )

    def manifest_geometry(self) -> dict[str, object]:
        def point(value: Point) -> dict[str, int]:
            return {"x": round(value.x), "y": round(value.y)}

        return {
            "model": "twoCurveGarlandFitV1",
            "coordinateSpace": "canonicalPixelsTopLeft",
            "landmarks": {
                "leftAttach": point(self.left_attachment),
                "rightAttach": point(self.right_attachment),
                "centerDrop": point(self.center_drop),
            },
            "pathAuthoring": {
                "model": "asymmetricTwoCubicBezierPathV1",
                "placement": "equalArcLengthTangentAligned",
                "endpointTaper": self.endpoint_taper,
                "leftControlPoints": [point(value) for value in self.left_controls],
                "rightControlPoints": [point(value) for value in self.right_controls],
            },
            "authoringTuning": {
                "status": "locked",
                "policy": "sharedAnatomicalSocketPreserveRhythmV1",
            },
            "trunkOccluderPolygon": [point(value) for value in self.occluder_polygon],
        }


def fit_garland(
    sprites: Mapping[str, Image.Image],
    socket: GarlandSocket,
    design: GarlandDesign,
) -> Image.Image:
    """Return one deterministic canonical-canvas Mala layer."""
    required = set(design.sprite_sequence)
    if design.centerpiece is not None:
        required.add(design.centerpiece.sprite_name)
    missing = sorted(required - sprites.keys())
    if missing:
        raise ValueError(f"Garland sprites are missing: {', '.join(missing)}")

    prepared = {name: _alpha_crop(sprites[name]) for name in required}
    layer = Image.new("RGBA", socket.canvas_size, (0, 0, 0, 0))
    for curve in socket.paths:
        _draw_thread(layer, curve, design.thread_width)

    for side_index, curve in enumerate(socket.paths):
        samples = _equal_arc_samples(curve, design.spacing)
        # The left strand owns the shared center drop unless an explicit
        # centerpiece replaces it. Both strands always own their t=0 endpoint.
        if side_index == 1 or design.centerpiece is not None:
            samples = samples[:-1]
        for index, (t, center, tangent) in enumerate(samples):
            sequence_index = (index + side_index) % len(design.sprite_sequence)
            sprite_name = design.sprite_sequence[sequence_index]
            taper = socket.endpoint_taper + (1.0 - socket.endpoint_taper) * sin(pi * t)
            rhythm = 1.0 + 0.04 * sin(index * 1.71 + side_index + design.phase)
            variation = 4.0 * sin(index * 1.37 + side_index * 0.8 + design.phase)
            _place_sprite(
                layer,
                prepared[sprite_name],
                center,
                tangent,
                design.widths[sequence_index] * taper * rhythm,
                variation,
            )

    if design.centerpiece is not None:
        centerpiece = design.centerpiece
        _place_sprite(
            layer,
            prepared[centerpiece.sprite_name],
            Point(
                socket.center_drop.x + centerpiece.offset.x,
                socket.center_drop.y + centerpiece.offset.y,
            ),
            Point(0, 1),
            centerpiece.width,
            0,
        )
    if design.shadow_opacity > 0:
        layer = _apply_contact_shadow(layer, design)
    return _clear_transparent_rgb(layer)


def _apply_contact_shadow(layer: Image.Image, design: GarlandDesign) -> Image.Image:
    """Ground the flowers against the body with restrained warm scene shadow."""
    alpha = layer.getchannel("A")
    if design.shadow_blur:
        alpha = alpha.filter(ImageFilter.GaussianBlur(design.shadow_blur))
    alpha = alpha.point(
        [min(255, round(value * design.shadow_opacity)) for value in range(256)]
    )
    shadow = Image.new("RGBA", layer.size, (74, 39, 16, 0))
    shadow.putalpha(alpha)
    result = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    result.alpha_composite(
        shadow,
        (round(design.shadow_offset.x), round(design.shadow_offset.y)),
    )
    result.alpha_composite(layer)
    return result


def garland_fit_envelope(
    socket: GarlandSocket,
    *,
    strand_radius: int,
    drop_radius: int,
) -> Image.Image:
    """Return a pose-owned RGBA safe envelope around the locked geometry."""
    if strand_radius <= 0 or drop_radius <= 0:
        raise ValueError("Garland fit-envelope radii must be positive")
    mask = Image.new("L", socket.canvas_size, 0)
    draw = ImageDraw.Draw(mask)
    for curve in socket.paths:
        for index in range(481):
            center = curve.point(index / 480)
            draw.ellipse(
                (
                    center.x - strand_radius,
                    center.y - strand_radius,
                    center.x + strand_radius,
                    center.y + strand_radius,
                ),
                fill=255,
            )
    for attachment in (socket.left_attachment, socket.right_attachment):
        draw.ellipse(
            (
                attachment.x - strand_radius,
                attachment.y - strand_radius,
                attachment.x + strand_radius,
                attachment.y + strand_radius,
            ),
            fill=255,
        )
    drop = socket.center_drop
    draw.ellipse(
        (
            drop.x - drop_radius,
            drop.y - drop_radius,
            drop.x + drop_radius,
            drop.y + drop_radius,
        ),
        fill=255,
    )
    result = Image.new("RGBA", socket.canvas_size, (255, 255, 255, 0))
    result.putalpha(mask)
    return _clear_transparent_rgb(result)


def _equal_arc_samples(
    curve: _CubicBezier,
    spacing: float,
) -> list[tuple[float, Point, Point]]:
    dense = [(index / 1200, curve.point(index / 1200)) for index in range(1201)]
    cumulative = [0.0]
    for (_, previous), (_, current) in zip(dense, dense[1:]):
        cumulative.append(cumulative[-1] + previous.distance(current))
    count = max(2, round(cumulative[-1] / spacing) + 1)
    result: list[tuple[float, Point, Point]] = []
    dense_index = 0
    for sample_index in range(count):
        target = cumulative[-1] * sample_index / (count - 1)
        # Floating-point multiplication can place the final target a fraction
        # beyond the accumulated endpoint. Clamp the lookup to the last dense
        # sample so every valid curve still owns its declared endpoint.
        while (
            dense_index < len(cumulative) - 1
            and cumulative[dense_index] < target
        ):
            dense_index += 1
        t, point = dense[dense_index]
        result.append((t, point, curve.tangent(t)))
    return result


def _draw_thread(layer: Image.Image, curve: _CubicBezier, width: int) -> None:
    points = [
        (curve.point(index / 240).x, curve.point(index / 240).y)
        for index in range(241)
    ]
    draw = ImageDraw.Draw(layer, "RGBA")
    draw.line(points, fill=(117, 65, 20, 225), width=width + 3, joint="curve")
    draw.line(points, fill=(230, 173, 48, 255), width=width, joint="curve")


def _place_sprite(
    layer: Image.Image,
    sprite: Image.Image,
    center: Point,
    tangent: Point,
    width: float,
    variation: float,
) -> None:
    target_width = max(1, round(width))
    target_height = max(1, round(sprite.height * target_width / sprite.width))
    item = sprite.resize((target_width, target_height), Image.Resampling.LANCZOS)
    angle = degrees(atan2(tangent.x, tangent.y)) + variation
    item = item.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    layer.alpha_composite(
        item,
        (round(center.x - item.width / 2), round(center.y - item.height / 2)),
    )


def _alpha_crop(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Garland source sprite has no visible pixels")
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
