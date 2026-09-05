from dataclasses import replace
from pathlib import Path
import sys

import pytest
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from accessory_fitting import OutfitDesign, OutfitSocket, fit_outfit


SOCKET = OutfitSocket(
    canvas_size=(40, 50),
    anchor=(10, 25),
    garment_regions=(
        ((5, 5), (35, 5), (35, 45), (5, 45)),
    ),
    protected_regions=(
        ((15, 15), (25, 15), (25, 35), (15, 35)),
    ),
    thumbnail_crop=(5, 10, 35, 40),
)


def test_fit_outfit_hides_isolation_clipping_preview_and_thumbnail_work() -> None:
    base = Image.new("RGB", SOCKET.canvas_size, (20, 30, 40))
    composite = Image.new("RGBA", SOCKET.canvas_size, (220, 50, 80, 255))

    fitted = fit_outfit(base, composite, SOCKET)
    alpha = fitted.layer.getchannel("A")

    assert alpha.getpixel((10, 10)) == 255
    assert alpha.getpixel((20, 25)) == 0
    assert alpha.getpixel((2, 2)) == 0
    assert fitted.reference.getpixel((10, 10))[:3] == (220, 50, 80)
    assert fitted.reference.getpixel((20, 25))[:3] == (20, 30, 40)
    assert fitted.thumbnail.size == (256, 256)
    assert fitted.fit_mask.getchannel("A").getbbox() == (5, 5, 36, 46)

    outside = ImageChops.multiply(
        alpha.point(lambda value: 255 if value else 0),
        ImageChops.invert(fitted.fit_mask.getchannel("A")),
    )
    assert outside.getbbox() is None


def test_unchanged_composite_becomes_a_nonempty_identity_preserving_variant() -> None:
    base = Image.new("RGBA", SOCKET.canvas_size, (20, 30, 40, 255))

    fitted = fit_outfit(base, Image.new("RGBA", SOCKET.canvas_size), SOCKET)

    assert fitted.layer.getchannel("A").getbbox() == (10, 25, 11, 26)
    assert fitted.reference.tobytes() == base.tobytes()


def test_outfit_socket_rejects_geometry_that_leaks_pose_knowledge() -> None:
    with pytest.raises(ValueError, match="canonical canvas"):
        replace(SOCKET, garment_regions=(((5, 5), (45, 5), (5, 45)),))
    with pytest.raises(ValueError, match="at least three"):
        replace(SOCKET, protected_regions=(((1, 1), (2, 2)),))
    with pytest.raises(ValueError, match="usable garment envelope"):
        replace(SOCKET, anchor=(20, 20))


def test_fit_outfit_rejects_noncanonical_sources() -> None:
    base = Image.new("RGB", SOCKET.canvas_size)

    with pytest.raises(ValueError, match="40x50"):
        fit_outfit(base, Image.new("RGB", (39, 50)), SOCKET)


def test_outfit_design_rejects_invalid_source_normalization() -> None:
    with pytest.raises(ValueError, match="wearable anchor"):
        OutfitDesign((float("nan"), 4))
    with pytest.raises(ValueError, match="source scale"):
        OutfitDesign((4, 4), scale=0)


def test_socket_reports_named_fit_contacts_and_rejects_under_fitted_art() -> None:
    socket = replace(
        SOCKET,
        fit_points=(("shoulder", (10, 10)), ("waist", (10, 40))),
        minimum_fit_points=2,
        fit_point_radius=2,
    )
    base = Image.new("RGB", socket.canvas_size, (20, 30, 40))
    source = Image.new("RGBA", socket.canvas_size, (0, 0, 0, 0))
    source.putpixel((10, 10), (220, 50, 80, 255))

    with pytest.raises(ValueError, match="misses 1 required pose fit point"):
        fit_outfit(base, source, socket)

    source.putpixel((10, 40), (220, 50, 80, 255))
    fitted = fit_outfit(base, source, socket)

    assert fitted.covered_fit_points == ("shoulder", "waist")
    assert socket.manifest_geometry()["minimumFitPoints"] == 2
