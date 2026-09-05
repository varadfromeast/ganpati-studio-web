from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


REPO = Path(__file__).parents[3]
CANVAS = (941, 1672)

# Identity pixels that an outfit layer can sit behind, but may never recolor.
FACE_AND_EAR = (
    ((495, 700), (556, 700), (585, 765), (575, 805), (548, 830), (510, 818), (492, 775)),
    ((582, 635), (742, 646), (774, 730), (754, 816), (684, 875), (630, 895), (605, 850), (590, 800)),
)


def protected_identity_mask() -> Image.Image:
    mask = Image.new("L", CANVAS, 0)
    draw = ImageDraw.Draw(mask)
    for polygon in FACE_AND_EAR:
        draw.polygon(polygon, fill=255)

    trunk = Image.open(
        REPO / "assets/packs/bal-seated-crowns-v2/layers/fixed-trunk-foreground.png"
    ).convert("RGBA").getchannel("A")
    # The fixed occluder owns the trunk; its expanded edge owns antialiasing too.
    trunk = trunk.filter(ImageFilter.MaxFilter(17))
    trunk = trunk.point(lambda value: 255 if value else 0)
    return ImageChops.lighter(mask, trunk)


def test_peacock_teal_layer_never_recolors_red_face_ear_or_trunk_contours():
    outfit_alpha = Image.open(
        REPO / "assets/packs/bal-seated-crowns-v2/layers/outfit-teal.png"
    ).convert("RGBA").getchannel("A")
    base_hsv = Image.open(
        REPO / "assets/packs/bal-seated-crowns-v2/layers/base.png"
    ).convert("HSV")
    hue, saturation, value = base_hsv.split()
    red_contours = hue.point(lambda pixel: 255 if pixel <= 13 else 0)
    saturated = saturation.point(lambda pixel: 255 if pixel >= 150 else 0)
    visible = value.point(lambda pixel: 255 if pixel >= 42 else 0)
    protected_red_contours = ImageChops.multiply(
        protected_identity_mask(),
        ImageChops.multiply(red_contours, ImageChops.multiply(saturated, visible)),
    )
    leaked = ImageChops.multiply(outfit_alpha, protected_red_contours)

    assert leaked.getbbox() is None


def test_peacock_teal_layer_still_contains_the_shoulder_sash():
    outfit_alpha = Image.open(
        REPO / "assets/packs/bal-seated-crowns-v2/layers/outfit-teal.png"
    ).convert("RGBA").getchannel("A")

    assert outfit_alpha.crop((600, 900, 640, 1010)).getbbox() is not None
