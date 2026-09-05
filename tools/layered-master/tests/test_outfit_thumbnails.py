from pathlib import Path

from PIL import Image


REPO = Path(__file__).parents[3]
THUMBNAILS = REPO / "assets/packs/bal-seated-crowns-v2/thumbnails"


def test_outfit_picker_uses_consistent_opaque_dressed_murti_crops():
    outfit_thumbnails = sorted(THUMBNAILS.glob("outfit-*.png"))

    assert len(outfit_thumbnails) == 4
    for thumbnail in outfit_thumbnails:
        image = Image.open(thumbnail).convert("RGBA")
        assert image.size == (256, 256)
        assert image.getchannel("A").getextrema() == (255, 255), thumbnail.name
