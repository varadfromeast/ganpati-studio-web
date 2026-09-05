import importlib.util
import json
import sys
from pathlib import Path

from PIL import Image


MODULE_PATH = Path(__file__).parents[3] / "scripts" / "layered_master_workbench.py"
SPEC = importlib.util.spec_from_file_location("layered_master_workbench", MODULE_PATH)
WORKBENCH = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = WORKBENCH
SPEC.loader.exec_module(WORKBENCH)


def _contract(tmp_path: Path) -> Path:
    reference = Image.new("RGB", (4, 4), (20, 30, 40))
    reference.save(tmp_path / "reference.png")
    contract = {
        "schemaVersion": 1,
        "canvas": {"width": 4, "height": 4},
        "referenceComposite": "reference.png",
        "referenceParity": {"maxMeanAbsoluteError": 0, "maxChangedPixelRatio": 0},
        "milestones": {
            "decomposition": {"requiredLayerIDs": ["scene"]},
            "mvp": {"requiredLayerIDs": ["scene"]},
        },
        "layers": [
            {"id": "scene", "file": "layers/scene.png", "zIndex": 0, "alpha": "opaque"}
        ],
    }
    path = tmp_path / "contract.json"
    path.write_text(json.dumps(contract), encoding="utf-8")
    return path


def test_matching_decomposition_passes(tmp_path: Path):
    contract = _contract(tmp_path)
    layers = tmp_path / "layers"
    layers.mkdir()
    Image.new("RGB", (4, 4), (20, 30, 40)).save(layers / "scene.png")

    report = WORKBENCH.verify(contract, tmp_path, tmp_path / "qa", "decomposition")

    assert report["passed"] is True
    assert report["referenceParity"] == {"meanAbsoluteError": 0.0, "changedPixelRatio": 0.0}


def test_missing_layer_fails_without_composite(tmp_path: Path):
    contract = _contract(tmp_path)

    report = WORKBENCH.verify(contract, tmp_path, tmp_path / "qa", "decomposition")

    assert report["passed"] is False
    assert report["composite"] is None
    assert any(item["code"] == "layer.missing" for item in report["findings"])


def test_reference_drift_is_reported(tmp_path: Path):
    contract = _contract(tmp_path)
    layers = tmp_path / "layers"
    layers.mkdir()
    Image.new("RGB", (4, 4), (255, 255, 255)).save(layers / "scene.png")

    report = WORKBENCH.verify(contract, tmp_path, tmp_path / "qa", "decomposition")

    assert report["passed"] is False
    assert any(item["code"] == "reference.drift" for item in report["findings"])
