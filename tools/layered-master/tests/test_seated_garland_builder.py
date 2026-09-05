from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from accessory_fitting import GarlandDesign, GarlandSocket, Point, fit_garland
import build_garland_collection as seated_builder


def test_seated_builder_routes_every_design_through_the_shared_interface(
    monkeypatch,
) -> None:
    assert seated_builder.Point is Point
    assert seated_builder.GarlandDesign is GarlandDesign
    assert seated_builder.GarlandSocket is GarlandSocket
    assert seated_builder.fit_garland is fit_garland

    sprites = object()
    calls = []

    def record_fit(received_sprites, socket, design):
        calls.append((received_sprites, socket, design))
        return design

    monkeypatch.setattr(seated_builder, "fit_garland", record_fit)

    rendered = seated_builder.build_garlands(sprites)

    assert rendered == seated_builder.GARLAND_DESIGNS
    assert calls == [
        (sprites, seated_builder.SEATED_GARLAND_SOCKET, design)
        for design in seated_builder.GARLAND_DESIGNS.values()
    ]
