import json
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "assets/packs/bal-dancing-geometry-v1"
RUNTIME_PACK = ROOT / "assets/runtime-packs/bal-dancing-geometry-v1"
sys.path.insert(0, str(ROOT / "scripts"))

from accessory_fitting import fit_garland
from build_dancing_joy_accessories import (
    DANCING_GARLAND_SOCKET,
    GARLAND_DESIGNS,
    load_garland_sprites,
)


def visible_pixels(mask: Image.Image) -> int:
    return sum(count for count, value in mask.getcolors(mask.width * mask.height) if value)


def garland_options(manifest: dict[str, object]) -> list[str]:
    return sorted(
        option["optionID"]
        for option in manifest["optionGroups"]
        if option["slot"] == "garland"
    )


def test_standing_pack_exposes_all_malas_in_authoring_and_runtime() -> None:
    authoring = json.loads((PACK / "manifest.v2.json").read_text(encoding="utf-8"))
    runtime = json.loads((RUNTIME_PACK / "manifest.v2.json").read_text(encoding="utf-8"))
    expected = [
        "garland.lotus-jasmine.bal-dancing.v1",
        "garland.marigold.bal-dancing.v1",
        "garland.none.bal-dancing.v1",
        "garland.rose-flowing.bal-dancing.v1",
        "garland.rose.bal-dancing.v1",
    ]

    assert garland_options(authoring) == expected
    assert garland_options(runtime) == expected


def test_standing_mala_socket_records_the_locked_two_curve_geometry() -> None:
    manifest = json.loads((PACK / "manifest.v2.json").read_text(encoding="utf-8"))
    socket = next(item for item in manifest["sockets"] if item["slot"] == "garland")

    assert socket["anchor"] == {"x": 485, "y": 743}
    assert socket["fitGeometry"] == DANCING_GARLAND_SOCKET.manifest_geometry()
    assert socket["fitGeometry"]["model"] == "twoCurveGarlandFitV1"
    assert socket["fitGeometry"]["authoringTuning"]["status"] == "locked"


def test_every_standing_mala_is_rendered_through_the_shared_socket() -> None:
    sprites = load_garland_sprites()
    fit_mask = Image.open(PACK / "fit-masks/garland-chest-zone.png").convert("RGBA")
    outside_mask = ImageChops.invert(fit_mask.getchannel("A"))

    for name, design in GARLAND_DESIGNS.items():
        expected = fit_garland(sprites, DANCING_GARLAND_SOCKET, design)
        artifact = Image.open(PACK / f"layers/garland-{name}-dancing.png").convert("RGBA")
        assert artifact.tobytes() == expected.tobytes()
        outside = ImageChops.multiply(artifact.getchannel("A"), outside_mask)
        assert outside.getbbox() is None


def test_marigold_right_strand_visibly_meets_the_trunk_occluder() -> None:
    garland = Image.open(PACK / "layers/garland-marigold-dancing.png").convert("RGBA")
    trunk = Image.open(PACK / "layers/fixed-trunk-foreground.png").convert("RGBA")
    garland_alpha = garland.getchannel("A").point(lambda value: 255 if value else 0)
    trunk_alpha = trunk.getchannel("A").point(lambda value: 255 if value else 0)
    outside_edge = ImageChops.subtract(
        trunk_alpha.filter(ImageFilter.MaxFilter(7)),
        trunk_alpha,
    )

    # A sizeable flower edge, not just the 3px thread, touches the foreground
    # occluder. This is the post-occlusion evidence that the right side is worn.
    contact = ImageChops.multiply(garland_alpha, outside_edge)
    assert visible_pixels(contact) >= 150


def test_every_standing_mala_occupies_the_shared_landmarks_and_meets_occlusion() -> None:
    trunk = Image.open(PACK / "layers/fixed-trunk-foreground.png").convert("RGBA")
    trunk_alpha = trunk.getchannel("A").point(lambda value: 255 if value else 0)
    outside_edge = ImageChops.subtract(
        trunk_alpha.filter(ImageFilter.MaxFilter(7)),
        trunk_alpha,
    )
    landmarks = (
        DANCING_GARLAND_SOCKET.left_attachment,
        DANCING_GARLAND_SOCKET.right_attachment,
        DANCING_GARLAND_SOCKET.center_drop,
    )

    for name in GARLAND_DESIGNS:
        garland = Image.open(
            PACK / f"layers/garland-{name}-dancing.png"
        ).convert("RGBA")
        alpha = garland.getchannel("A").point(lambda value: 255 if value else 0)
        for point in landmarks:
            x, y = round(point.x), round(point.y)
            neighborhood = alpha.crop((x - 4, y - 4, x + 5, y + 5))
            assert visible_pixels(neighborhood) == 81, (name, point)
        assert visible_pixels(ImageChops.multiply(alpha, outside_edge)) >= 60, name


def test_mala_design_data_cannot_override_pose_geometry() -> None:
    forbidden = {
        "left_attachment",
        "right_attachment",
        "center_drop",
        "left_controls",
        "right_controls",
        "offset",
    }
    for design in GARLAND_DESIGNS.values():
        assert forbidden.isdisjoint(design.__dataclass_fields__)


def test_runtime_pack_is_a_byte_identical_stage_of_every_referenced_file() -> None:
    report = json.loads(
        (RUNTIME_PACK / "runtime-pack-report.json").read_text(encoding="utf-8")
    )
    assert (RUNTIME_PACK / "manifest.v2.json").read_bytes() == (
        PACK / "manifest.v2.json"
    ).read_bytes()
    assert report["counts"]["files"] == len(report["inventory"])
    for item in report["inventory"]:
        relative = item["path"]
        assert (RUNTIME_PACK / relative).read_bytes() == (PACK / relative).read_bytes()
