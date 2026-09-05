import json
from pathlib import Path
import sys

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "assets/packs/bal-dancing-geometry-v1"
RUNTIME_PACK = ROOT / "assets/runtime-packs/bal-dancing-geometry-v1"
sys.path.insert(0, str(ROOT / "scripts"))

from build_dancing_joy_accessories import (
    DANCING_OUTFIT_SOCKET,
    OUTFIT_CATALOG,
    build_outfits,
)


EXPECTED_OPTIONS = [
    "outfit.armor-royal.bal-dancing.v1",
    "outfit.jewel-festival.bal-dancing.v1",
    "outfit.saffron.bal-dancing.v1",
    "outfit.teal.bal-dancing.v1",
]


def outfit_options(manifest: dict[str, object]) -> list[str]:
    return sorted(
        option["optionID"]
        for option in manifest["optionGroups"]
        if option["slot"] == "outfit"
    )


def test_standing_pack_exposes_every_outfit_in_authoring_and_runtime() -> None:
    authoring = json.loads((PACK / "manifest.v2.json").read_text(encoding="utf-8"))
    runtime = json.loads((RUNTIME_PACK / "manifest.v2.json").read_text(encoding="utf-8"))

    assert outfit_options(authoring) == EXPECTED_OPTIONS
    assert outfit_options(runtime) == EXPECTED_OPTIONS
    assert authoring["posture"]["defaultSelections"]["outfit"] == (
        "outfit.saffron.bal-dancing.v1"
    )


def test_every_standing_outfit_is_built_through_the_shared_socket() -> None:
    base = Image.open(PACK / "layers/base.png").convert("RGBA")
    fitted = build_outfits(base)
    mask = Image.open(PACK / "fit-masks/outfit-full-body-zone.png").convert("RGBA")
    forbidden = ImageChops.invert(mask.getchannel("A"))

    assert list(fitted) == list(OUTFIT_CATALOG)
    for name, result in fitted.items():
        artifact = Image.open(PACK / f"layers/outfit-{name}-dancing.png").convert("RGBA")
        assert artifact.tobytes() == result.layer.tobytes()
        assert ImageChops.multiply(artifact.getchannel("A"), forbidden).getbbox() is None
        if name != "saffron":
            assert len(result.covered_fit_points) >= DANCING_OUTFIT_SOCKET.minimum_fit_points


def test_shared_socket_protects_trunk_and_bare_feet_for_every_outfit() -> None:
    fit_mask = DANCING_OUTFIT_SOCKET.fit_mask()

    for polygon in DANCING_OUTFIT_SOCKET.protected_regions:
        x = round(sum(point[0] for point in polygon) / len(polygon))
        y = round(sum(point[1] for point in polygon) / len(polygon))
        assert fit_mask.getpixel((x, y)) == 0


def test_outfits_have_snug_body_contact_through_the_shared_socket() -> None:
    # These canonical points sit on the shoulder/torso and waist of the pose.
    # Every authored treatment must occupy both, while the base Variant remains
    # the intentional no-op.
    required_contacts = {
        "armor-royal": {"leftShoulder", "rightShoulder", "waist"},
        "teal": {"leftShoulder", "rightShoulder", "waist"},
        "jewel-festival": {"rightCollar", "upperTorso", "waist"},
    }
    fitted = build_outfits(Image.open(PACK / "layers/base.png").convert("RGBA"))
    for name in OUTFIT_CATALOG:
        if name == "saffron":
            continue
        assert required_contacts[name].issubset(fitted[name].covered_fit_points)


def test_canonical_outfit_sources_keep_their_authored_body_attachment_geometry() -> None:
    """Do not re-scale composites already authored on this Base Murti canvas."""
    for name, (_, _, source_path, design) in OUTFIT_CATALOG.items():
        if source_path is None:
            continue
        assert design is None, f"{name} adds a per-outfit coordinate transform"


def test_bal_kavach_preserves_reviewed_collar_and_shoulder_contacts() -> None:
    base = Image.open(PACK / "layers/base.png").convert("RGBA")
    fitted = build_outfits(base)["armor-royal"].reference.convert("RGB")
    composite = Image.open(
        ROOT
        / "design/asset-sources/outfits/bal-dancing-v1/armor-royal-composite-v1.png"
    ).convert("RGB")
    contacts = {
        "leftShoulder": (300, 760),
        "rightShoulder": (680, 750),
        "leftCollar": (360, 750),
        "rightCollar": (600, 770),
    }

    for name, point in contacts.items():
        expected = composite.getpixel(point)
        actual = fitted.getpixel(point)
        assert max(abs(a - b) for a, b in zip(actual, expected)) <= 3, (
            f"Bal Kavach misses its reviewed {name} contact at {point}"
        )

    # The armor does not own the flowing-angavastram side envelope.
    background_probe = (760, 900)
    assert fitted.getpixel(background_probe) == base.convert("RGB").getpixel(
        background_probe
    )
