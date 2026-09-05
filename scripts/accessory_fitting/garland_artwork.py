"""Load the approved flower sprites used by every component-built Mala."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


_COMPONENTS = {
    "rose": ("rose-temple-unit-v2-alpha.png", (340, 245, 680, 765)),
    "jasmine": ("jasmine-braid-unit-v2-alpha.png", (405, 240, 615, 490)),
    "flowingRose": ("rose-flowing-unit-v2-alpha.png", (260, 300, 765, 875)),
    "marigoldOrange": ("marigold-unit-v2-alpha.png", (195, 180, 825, 805)),
    "marigoldYellow": ("marigold-unit-v2-alpha.png", (285, 875, 745, 1350)),
    "lotus": ("lotus-centerpiece-v2-alpha.png", (70, 190, 1185, 1070)),
}


def load_garland_sprites(component_directory: Path) -> dict[str, Image.Image]:
    """Return alpha-cropped sprites from the one approved component catalog."""
    sources: dict[str, Image.Image] = {}
    result: dict[str, Image.Image] = {}
    for name, (file_name, crop) in _COMPONENTS.items():
        source = sources.get(file_name)
        if source is None:
            source = Image.open(component_directory / file_name).convert("RGBA")
            sources[file_name] = source
        result[name] = _alpha_crop(source, crop)
    return result


def _alpha_crop(
    image: Image.Image,
    box: tuple[int, int, int, int],
) -> Image.Image:
    cropped = image.crop(box)
    bounds = cropped.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"Garland component crop {box} has no visible pixels")
    return _clear_transparent_rgb(cropped.crop(bounds))


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
