from pathlib import Path
import sys

import pytest
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from accessory_fitting import GarlandDesign, GarlandSocket, Point, fit_garland


SOCKET = GarlandSocket(
    canvas_size=(160, 180),
    left_attachment=Point(35, 35),
    right_attachment=Point(125, 30),
    center_drop=Point(80, 145),
    left_controls=(Point(25, 75), Point(45, 120)),
    right_controls=(Point(140, 70), Point(120, 120)),
    occluder_polygon=(Point(90, 20), Point(140, 20), Point(140, 65)),
)
DESIGN = GarlandDesign(
    sprite_sequence=("marker",),
    spacing=24,
    widths=(11,),
    thread_width=2,
)


def marker() -> Image.Image:
    image = Image.new("RGBA", (11, 11), (255, 0, 255, 255))
    image.putpixel((5, 5), (255, 255, 255, 255))
    return image


def test_fit_garland_places_a_sprite_at_both_attachments_and_the_drop() -> None:
    fitted = fit_garland({"marker": marker()}, SOCKET, DESIGN)

    for point in (
        SOCKET.left_attachment,
        SOCKET.right_attachment,
        SOCKET.center_drop,
    ):
        x, y = round(point.x), round(point.y)
        marker_pixels = [
            fitted.getpixel((sample_x, sample_y))
            for sample_y in range(y - 2, y + 3)
            for sample_x in range(x - 2, x + 3)
        ]
        assert any(
            pixel[0] > 240 and pixel[2] > 240 and pixel[1] < 30 and pixel[3] > 240
            for pixel in marker_pixels
        )


def test_fit_garland_is_deterministic_through_its_public_interface() -> None:
    first = fit_garland({"marker": marker()}, SOCKET, DESIGN)
    second = fit_garland({"marker": marker()}, SOCKET, DESIGN)

    assert first.tobytes() == second.tobytes()


def test_socket_serializes_the_geometry_that_drives_fitting() -> None:
    geometry = SOCKET.manifest_geometry()

    assert geometry["model"] == "twoCurveGarlandFitV1"
    assert geometry["landmarks"] == {
        "leftAttach": {"x": 35, "y": 35},
        "rightAttach": {"x": 125, "y": 30},
        "centerDrop": {"x": 80, "y": 145},
    }
    assert geometry["pathAuthoring"]["leftControlPoints"] == [
        {"x": 25, "y": 75},
        {"x": 45, "y": 120},
    ]
    assert geometry["pathAuthoring"]["placement"] == "equalArcLengthTangentAligned"
    assert geometry["authoringTuning"]["status"] == "locked"
    assert SOCKET.anchor == Point(80, 32.5)


def test_fit_garland_rejects_missing_or_empty_source_sprites() -> None:
    with pytest.raises(ValueError, match="missing"):
        fit_garland({}, SOCKET, DESIGN)

    with pytest.raises(ValueError, match="no visible pixels"):
        fit_garland({"marker": Image.new("RGBA", (4, 4))}, SOCKET, DESIGN)


def test_design_rejects_invalid_spacing_and_widths() -> None:
    with pytest.raises(ValueError, match="spacing"):
        GarlandDesign(("marker",), 0, (10,), 2)
    with pytest.raises(ValueError, match="widths"):
        GarlandDesign(("marker",), 10, (), 2)
    with pytest.raises(ValueError, match="widths"):
        GarlandDesign(("marker",), 10, (0,), 2)
