from dataclasses import replace
from pathlib import Path
import sys

import pytest
from PIL import Image


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from accessory_fitting import (
    HeadwearDesign,
    HeadwearSocket,
    WearableBand,
    fit_headwear,
)


SOCKET = HeadwearSocket(
    canvas_size=(160, 180),
    left_temple=(50, 60),
    right_temple=(110, 60),
    hairline_center=(80, 58),
    apex=(80, 20),
    left_ear_top=(30, 65),
    right_ear_top=(130, 65),
    tilak_top=(80, 75),
)


def test_design_controls_width_and_vertical_lift_without_horizontal_tuning() -> None:
    source = Image.new("RGBA", (20, 10), (255, 0, 255, 255))

    default = fit_headwear(source, SOCKET)
    fitted = fit_headwear(
        source,
        SOCKET,
        design=HeadwearDesign(width_factor=0.5, vertical_lift=7),
    )

    assert default.getchannel("A").getbbox() == (30, 52, 130, 102)
    assert fitted.getchannel("A").getbbox() == (55, 70, 105, 95)
    assert SOCKET.anchor == SOCKET.hairline_center == (80, 58)


def test_wearable_band_center_maps_to_the_lifted_socket_anchor() -> None:
    source = Image.new("RGBA", (21, 11), (20, 40, 200, 255))
    for y in range(4, 7):
        for x in range(9, 12):
            source.putpixel((x, y), (255, 0, 255, 255))
    design = HeadwearDesign(
        wearable_band=WearableBand(
            left_endpoint=(0, 10),
            center_lower_rim=(10, 5),
            right_endpoint=(20, 10),
        ),
        vertical_lift=8,
    )

    fitted = fit_headwear(source, SOCKET, design=design)
    target_x = round(SOCKET.anchor[0])
    target_y = round(SOCKET.anchor[1] - design.vertical_lift)

    pixel = fitted.getpixel((target_x, target_y))
    assert pixel[0] > 240 and pixel[2] > 240 and pixel[1] < 20


@pytest.mark.parametrize(
    ("width_factor", "vertical_lift", "message"),
    (
        (0, 0, "width factor"),
        (float("inf"), 0, "width factor"),
        (1, -1, "vertical lift"),
        (1, float("nan"), "vertical lift"),
    ),
)
def test_design_rejects_invalid_tuning(
    width_factor: float,
    vertical_lift: float,
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        HeadwearDesign(
            width_factor=width_factor,
            vertical_lift=vertical_lift,
        )


def test_wearable_band_rejects_invalid_landmarks() -> None:
    with pytest.raises(ValueError, match="left endpoint"):
        WearableBand((20, 10), (10, 5), (0, 10))
    with pytest.raises(ValueError, match="center"):
        WearableBand((0, 10), (21, 5), (20, 10))
    with pytest.raises(ValueError, match="finite"):
        WearableBand((0, 10), (10, float("nan")), (20, 10))


def test_socket_rejects_invalid_pose_geometry() -> None:
    with pytest.raises(ValueError, match="canvas dimensions"):
        replace(SOCKET, canvas_size=(0, 180))
    with pytest.raises(ValueError, match="canonical canvas"):
        replace(SOCKET, apex=(80, -1))
    with pytest.raises(ValueError, match="left temple"):
        replace(SOCKET, left_temple=(115, 60))
    with pytest.raises(ValueError, match="left ear"):
        replace(SOCKET, left_ear_top=(135, 65))
    with pytest.raises(ValueError, match="hairline center"):
        replace(SOCKET, hairline_center=(45, 58))
    with pytest.raises(ValueError, match="tilak top must lie between"):
        replace(SOCKET, tilak_top=(45, 75))
    with pytest.raises(ValueError, match="apex"):
        replace(SOCKET, apex=(80, 58))
    with pytest.raises(ValueError, match="tilak top must lie below"):
        replace(SOCKET, tilak_top=(80, 57))
    with pytest.raises(ValueError, match="lower rim"):
        replace(SOCKET, left_temple=(50, 140), right_temple=(110, 140))


def test_fit_headwear_rejects_an_empty_source() -> None:
    with pytest.raises(ValueError, match="no visible pixels"):
        fit_headwear(Image.new("RGBA", (4, 4)), SOCKET)
