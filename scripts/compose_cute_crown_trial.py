from dataclasses import dataclass
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "runtime" / "cute"
CANVAS_SIZE = (941, 1672)


@dataclass(frozen=True)
class HeadwearFit:
    source_name: str
    output_stem: str
    width: int
    y: int


FITS = (
    HeadwearFit("headwear-royal-mukut-alpha-v1.png", "headwear-royal-mukut", 370, 300),
    HeadwearFit("headwear-peacock-mukut-alpha-v1.png", "headwear-peacock-mukut", 400, 270),
    HeadwearFit("headwear-floral-alpha-v1.png", "headwear-floral", 420, 385),
)


def fitted_headwear(specification: HeadwearFit) -> tuple[Image.Image, Image.Image]:
    source = Image.open(ASSETS / specification.source_name).convert("RGBA")
    alpha = source.getchannel("A").point(lambda value: 0 if value < 64 else value)
    source.putalpha(alpha)

    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError(f"{specification.source_name} contains no visible pixels")

    trimmed = source.crop(bounds)
    height = round(trimmed.height * specification.width / trimmed.width)
    fitted = trimmed.resize((specification.width, height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(
        fitted,
        ((canvas.width - specification.width) // 2, specification.y),
    )
    return fitted, canvas


base = Image.open(ASSETS / "cute-bal-ganpati-base-v1.png").convert("RGBA")
for fit in FITS:
    thumbnail, overlay = fitted_headwear(fit)
    thumbnail.save(ASSETS / f"{fit.output_stem}-thumbnail-v1.png", optimize=True)
    overlay.save(ASSETS / f"{fit.output_stem}-overlay-v1.png", optimize=True)
    Image.alpha_composite(base, overlay).save(f"/tmp/{fit.output_stem}-preview.png")
