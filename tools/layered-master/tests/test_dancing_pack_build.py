from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "assets/packs/bal-dancing-geometry-v1"
sys.path.insert(0, str(ROOT / "scripts"))

from accessory_fitting import author_scene_variant
from build_dancing_joy_accessories import build_pack


BACKGROUND_SOURCE = (
    ROOT
    / "design/asset-sources/backgrounds/celestial-aarti-empty-shrine-dancing-v2.png"
)
CANONICAL_BASE = (
    ROOT / "design/asset-sources/base-murtis/bal-dancing-clean-v1.png"
)
CANONICAL_MURTI_MASK = (
    ROOT
    / "design/asset-sources/backgrounds/dancing-murti-foreground-mask-v2.png"
)


def test_celestial_scene_preserves_canonical_base_murti_pixels() -> None:
    canonical = Image.open(CANONICAL_BASE).convert("RGBA")
    mask = Image.open(CANONICAL_MURTI_MASK).convert("L")
    authored = author_scene_variant(
        BACKGROUND_SOURCE,
        canonical.size,
        canonical_base_source=CANONICAL_BASE,
        foreground_mask_source=CANONICAL_MURTI_MASK,
    )

    geometry_mask = mask.point(lambda value: 255 if value >= 128 else 0)
    matte_mask = geometry_mask.filter(ImageFilter.GaussianBlur(0.7))
    protected_mask = matte_mask.point(lambda value: 255 if value == 255 else 0)
    difference = ImageChops.difference(authored.layer, canonical).convert("RGB")
    protected_difference = Image.composite(
        difference,
        Image.new("RGB", canonical.size, "black"),
        protected_mask,
    )

    assert geometry_mask.getbbox() == (80, 328, 763, 1418)
    assert sum(matte_mask.histogram()[1:255]) > 0
    assert protected_difference.getbbox() is None


def test_scene_authoring_preserves_the_approved_integrated_composite() -> None:
    source = Image.open(BACKGROUND_SOURCE).convert("RGBA")
    canonical = Image.open(CANONICAL_BASE).convert("RGBA")

    authored = author_scene_variant(
        BACKGROUND_SOURCE,
        source.size,
        canonical_base_source=CANONICAL_BASE,
        foreground_mask_source=CANONICAL_MURTI_MASK,
    )

    assert authored.layer.getpixel((470, 700)) == canonical.getpixel((470, 700))
    assert authored.layer.getpixel((20, 780)) == source.getpixel((20, 780))
    assert authored.layer.getpixel((900, 720)) == source.getpixel((900, 720))
    assert authored.layer.getpixel((0, 0))[3] == 254
    assert authored.thumbnail.size == (256, 256)
    assert authored.reference.tobytes() == authored.layer.tobytes()


def test_celestial_scene_does_not_retain_daylight_silhouette_echoes() -> None:
    background = Image.open(BACKGROUND_SOURCE).convert("RGBA")
    authored = author_scene_variant(
        BACKGROUND_SOURCE,
        background.size,
        canonical_base_source=CANONICAL_BASE,
        foreground_mask_source=CANONICAL_MURTI_MASK,
    )

    # These points sit immediately outside the true dancing-murti silhouette.
    # The old broad matte retained pale daylight pixels here, which appeared as
    # duplicate arms/ears/legs and the grey wedge between the left ear and hand.
    for point in ((270, 580), (624, 721), (332, 365), (335, 1023)):
        assert authored.layer.getpixel(point) == background.getpixel(point)


def test_build_pack_reproduces_every_shipped_standing_artifact(
    tmp_path: Path,
) -> None:
    generated = tmp_path / "bal-dancing-geometry-v1"

    build_pack(generated)

    files = sorted(
        path.relative_to(generated)
        for path in generated.rglob("*")
        if path.is_file()
    )
    assert files
    for relative in files:
        assert (PACK / relative).read_bytes() == (generated / relative).read_bytes()
