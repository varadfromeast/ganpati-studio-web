import json
from pathlib import Path
import sys

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[3]
PACK = ROOT / "assets/packs/bal-dancing-geometry-v1"
RUNTIME_PACK = ROOT / "assets/runtime-packs/bal-dancing-geometry-v1"
SEATED_PACK = ROOT / "assets/packs/bal-seated-crowns-v2"
sys.path.insert(0, str(ROOT / "scripts"))

from accessory_fitting import (
    HeadwearDesign,
    HeadwearSocket,
    WearableBand,
    fit_headwear,
)
from build_dancing_joy_accessories import build_crown


SOCKET = HeadwearSocket(
    canvas_size=(941, 1672),
    left_temple=(286, 515),
    right_temple=(571, 455),
    hairline_center=(430, 472),
    apex=(458, 237),
    left_ear_top=(237, 509),
    right_ear_top=(609, 466),
    tilak_top=(432, 492),
)
PEACOCK_BAND = WearableBand(
    left_endpoint=(20, 360),
    center_lower_rim=(202, 259),
    right_endpoint=(399, 360),
)
BLUE_LOTUS_BAND = WearableBand(
    left_endpoint=(20, 364),
    center_lower_rim=(202, 277),
    right_endpoint=(384, 364),
)
FLOWER_BAND = WearableBand(
    left_endpoint=(25, 390),
    center_lower_rim=(453, 235),
    right_endpoint=(835, 330),
)
CROWN_BANDS = {
    "blue-lotus": BLUE_LOTUS_BAND,
    "peacock": PEACOCK_BAND,
}
CROWN_DESIGNS = {
    "royal": HeadwearDesign(width_factor=0.94, vertical_lift=16),
    "flower": HeadwearDesign(
        wearable_band=FLOWER_BAND,
        width_factor=0.82,
        vertical_lift=58,
    ),
    "peacock": HeadwearDesign(wearable_band=PEACOCK_BAND),
    "blue-lotus": HeadwearDesign(
        wearable_band=BLUE_LOTUS_BAND,
        width_factor=0.90,
        vertical_lift=18,
    ),
}


def test_bundled_runtime_pack_matches_authoring_crown_catalog() -> None:
    authoring = json.loads((PACK / "manifest.v2.json").read_text(encoding="utf-8"))
    runtime = json.loads((RUNTIME_PACK / "manifest.v2.json").read_text(encoding="utf-8"))

    def crown_options(manifest: dict[str, object]) -> list[str]:
        return sorted(
            option["optionID"]
            for option in manifest["optionGroups"]
            if option["slot"] == "crown"
        )

    assert crown_options(runtime) == crown_options(authoring)


def test_annotated_crowns_map_their_wearable_band_not_outer_bounds() -> None:
    for name, band in CROWN_BANDS.items():
        source = Image.open(SEATED_PACK / f"layers/crown-{name}.png").convert("RGBA")
        source_bounds = source.getchannel("A").getbbox()
        assert source_bounds is not None

        # A marker on the annotated lower-rim center follows the real fitting path.
        marked = source.copy()
        marker_x = source_bounds[0] + round(band.center_lower_rim[0])
        marker_y = source_bounds[1] + round(band.center_lower_rim[1])
        for y in range(marker_y - 2, marker_y + 3):
            for x in range(marker_x - 2, marker_x + 3):
                marked.putpixel((x, y), (255, 0, 255, 255))

        fitted = fit_headwear(
            marked,
            SOCKET,
            design=HeadwearDesign(wearable_band=band),
        )
        marker_pixels = [
            (x, y)
            for y in range(
                round(SOCKET.hairline_center[1]) - 8,
                round(SOCKET.hairline_center[1]) + 9,
            )
            for x in range(
                round(SOCKET.hairline_center[0]) - 8,
                round(SOCKET.hairline_center[0]) + 9,
            )
            if (lambda pixel: pixel[0] > 220 and pixel[2] > 220 and pixel[1] < 40)(
                fitted.getpixel((x, y))
            )
        ]
        assert marker_pixels
        marker_center = (
            round(sum(x for x, _ in marker_pixels) / len(marker_pixels)),
            round(sum(y for _, y in marker_pixels) / len(marker_pixels)),
        )
        assert abs(marker_center[0] - SOCKET.hairline_center[0]) <= 2
        assert abs(marker_center[1] - SOCKET.hairline_center[1]) <= 2


def test_headwear_module_fits_standard_silhouettes_through_one_interface() -> None:
    fitted = {}
    for name in ("royal", "peacock", "blue-lotus"):
        source = Image.open(SEATED_PACK / f"layers/crown-{name}.png").convert("RGBA")
        fitted[name] = fit_headwear(
            source,
            SOCKET,
            design=CROWN_DESIGNS[name],
        )

    royal_bounds = fitted["royal"].getchannel("A").getbbox()
    peacock_bounds = fitted["peacock"].getchannel("A").getbbox()
    blue_lotus_bounds = fitted["blue-lotus"].getchannel("A").getbbox()
    assert royal_bounds is not None
    assert peacock_bounds is not None
    assert blue_lotus_bounds is not None

    left, _, right, bottom = royal_bounds
    assert right - left == round(SOCKET.target_width * 0.94)
    assert left + right == 2 * round(SOCKET.hairline_center[0])
    assert bottom == SOCKET.lower_rim_y - 16



def test_dancing_crown_uses_centered_head_relative_geometry() -> None:
    manifest = json.loads((PACK / "manifest.v2.json").read_text(encoding="utf-8"))
    socket = next(item for item in manifest["sockets"] if item["slot"] == "crown")
    geometry = socket["fitGeometry"]
    landmarks = geometry["landmarks"]
    tuning = geometry["authoringTuning"]

    crown = Image.open(PACK / "layers/crown-royal-dancing.png").convert("RGBA")
    bounds = crown.getchannel("A").getbbox()
    assert bounds is not None
    left, top, right, bottom = bounds

    head_axis_x = landmarks["hairlineCenter"]["x"]
    assert socket["anchor"] == landmarks["hairlineCenter"]
    assert tuning == {
        "status": "locked",
        "policy": "anatomicalLandmarksPreserveSilhouetteV1",
    }
    seated_crown = Image.open(
        SEATED_PACK / "layers/crown-royal.png"
    ).convert("RGBA")
    seated_bounds = seated_crown.getchannel("A").getbbox()
    assert seated_bounds is not None
    seated_width = seated_bounds[2] - seated_bounds[0]
    seated_height = seated_bounds[3] - seated_bounds[1]

    # Keep the approved snug width and lifted lower rim while preserving the
    # source silhouette's height-to-width proportion.
    assert right - left == round(SOCKET.target_width * 0.94)
    assert bottom - top == round((right - left) * seated_height / seated_width)
    assert bottom == SOCKET.lower_rim_y - 16
    assert left + right == 2 * head_axis_x

    fit_mask = Image.open(PACK / socket["fitMask"]["file"]).convert("RGBA")
    mask_bounds = fit_mask.getchannel("A").getbbox()
    assert mask_bounds is not None
    assert mask_bounds[0] <= left and mask_bounds[1] <= top
    assert mask_bounds[2] >= right and mask_bounds[3] >= bottom

    for name in ("royal", "flower", "peacock", "blue-lotus"):
        artifact = Image.open(PACK / f"layers/crown-{name}-dancing.png").convert("RGBA")
        expected = (
            build_crown("flower")
            if name == "flower"
            else fit_headwear(
                Image.open(SEATED_PACK / f"layers/crown-{name}.png"),
                SOCKET,
                design=CROWN_DESIGNS[name],
            )
        )
        assert artifact.tobytes() == expected.tobytes()


def test_every_standing_crown_stays_inside_the_locked_head_fit_mask() -> None:
    mask = Image.open(PACK / "fit-masks/crown-head-zone.png").convert("RGBA")
    allowed = mask.getchannel("A").point(lambda value: 255 if value else 0)
    forbidden = ImageChops.invert(allowed)

    for name in ("royal", "flower", "peacock", "blue-lotus"):
        crown = Image.open(PACK / f"layers/crown-{name}-dancing.png").convert("RGBA")
        occupied = crown.getchannel("A").point(lambda value: 255 if value else 0)
        assert ImageChops.multiply(occupied, forbidden).getbbox() is None, name


def test_open_backed_dancing_crowns_wrap_the_full_head_socket() -> None:
    for name, band in (("peacock", PEACOCK_BAND),):
        crown = Image.open(PACK / f"layers/crown-{name}-dancing.png").convert("RGBA")
        source = Image.open(SEATED_PACK / f"layers/crown-{name}.png").convert("RGBA")

        assert crown.tobytes() == fit_headwear(
            source,
            SOCKET,
            design=CROWN_DESIGNS[name],
        ).tobytes()


def test_flower_crown_wraps_inside_the_head_and_ends_above_both_ears() -> None:
    crown = Image.open(PACK / "layers/crown-flower-dancing.png").convert("RGBA")
    alpha = crown.getchannel("A")
    left_half = alpha.crop((0, 0, round(SOCKET.hairline_center[0]), alpha.height))
    right_half = alpha.crop((round(SOCKET.hairline_center[0]), 0, alpha.width, alpha.height))
    left_bounds = left_half.getbbox()
    right_bounds = right_half.getbbox()

    assert left_bounds is not None
    assert right_bounds is not None
    assert left_bounds[0] > SOCKET.left_ear_top[0]
    assert left_bounds[3] < SOCKET.left_ear_top[1]
    assert right_bounds[2] + round(SOCKET.hairline_center[0]) < SOCKET.right_ear_top[0]
    assert right_bounds[3] < SOCKET.right_ear_top[1]


def test_closed_dancing_mukuts_are_narrower_and_higher() -> None:
    for name in ("royal", "blue-lotus"):
        source = Image.open(SEATED_PACK / f"layers/crown-{name}.png").convert("RGBA")
        band = CROWN_BANDS.get(name)
        default = fit_headwear(
            source,
            SOCKET,
            design=HeadwearDesign(wearable_band=band),
        )
        adjusted = Image.open(
            PACK / f"layers/crown-{name}-dancing.png"
        ).convert("RGBA")
        default_bounds = default.getchannel("A").getbbox()
        adjusted_bounds = adjusted.getchannel("A").getbbox()
        assert default_bounds is not None
        assert adjusted_bounds is not None

        assert adjusted_bounds[2] - adjusted_bounds[0] < default_bounds[2] - default_bounds[0]
        assert adjusted_bounds[3] < default_bounds[3]
        assert abs(
            (adjusted_bounds[0] + adjusted_bounds[2]) / 2
            - SOCKET.hairline_center[0]
        ) <= 20
