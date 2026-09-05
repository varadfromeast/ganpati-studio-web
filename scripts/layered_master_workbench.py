#!/usr/bin/env python3
"""Validate and preview an artist-authored layered master.

The runtime asset pack compiler validates assets after authoring. This module
owns the earlier seam: proving that a layered source reconstructs the locked
reference and that every swappable layer obeys the same canvas/alpha contract.

Usage:
    python scripts/layered_master_workbench.py \
        authoring/bal-seated-layered-master-v1/contract.json \
        /path/to/exported-master \
        --output /tmp/layered-master-qa \
        --milestone decomposition
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageChops, ImageStat


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    message: str

    def as_dict(self) -> dict[str, str]:
        return {"severity": self.severity, "code": self.code, "message": self.message}


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("contract root must be an object")
    return value


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _required_layer_ids(contract: dict[str, Any], milestone: str) -> set[str]:
    milestones = contract.get("milestones", {})
    if milestone not in milestones:
        raise ValueError(f"unknown milestone: {milestone}")
    required = milestones[milestone].get("requiredLayerIDs", [])
    if not isinstance(required, list) or not all(isinstance(item, str) for item in required):
        raise ValueError(f"milestone {milestone} requiredLayerIDs must be strings")
    return set(required)


def _validate_contract(contract: dict[str, Any], milestone: str) -> list[Finding]:
    findings: list[Finding] = []
    if contract.get("schemaVersion") != 1:
        findings.append(Finding("error", "contract.schema", "schemaVersion must be 1"))

    canvas = contract.get("canvas", {})
    if not all(isinstance(canvas.get(key), int) and canvas[key] > 0 for key in ("width", "height")):
        findings.append(Finding("error", "contract.canvas", "canvas width and height must be positive integers"))

    layers = contract.get("layers", [])
    if not isinstance(layers, list) or not layers:
        findings.append(Finding("error", "contract.layers", "layers must be a non-empty array"))
        return findings

    ids = [layer.get("id") for layer in layers]
    duplicates = sorted({item for item in ids if ids.count(item) > 1})
    if duplicates:
        findings.append(Finding("error", "contract.duplicate-id", f"duplicate layer IDs: {duplicates}"))

    required = _required_layer_ids(contract, milestone)
    unknown = sorted(required - set(ids))
    if unknown:
        findings.append(Finding("error", "contract.unknown-required", f"unknown required layer IDs: {unknown}"))

    for layer in layers:
        if layer.get("alpha") not in {"opaque", "required"}:
            findings.append(Finding("error", "contract.alpha", f"{layer.get('id')} has invalid alpha rule"))
        if not isinstance(layer.get("zIndex"), int):
            findings.append(Finding("error", "contract.z-index", f"{layer.get('id')} needs an integer zIndex"))
        bounds = layer.get("allowedAlphaBounds")
        if bounds is not None and (
            not isinstance(bounds, list)
            or len(bounds) != 4
            or not all(isinstance(item, int) for item in bounds)
        ):
            findings.append(Finding("error", "contract.bounds", f"{layer.get('id')} has invalid allowedAlphaBounds"))
    return findings


def _alpha_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    if "A" not in image.getbands():
        return (0, 0, image.width, image.height)
    return image.getchannel("A").getbbox()


def _inside(inner: tuple[int, int, int, int], outer: list[int]) -> bool:
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def verify(
    contract_path: Path,
    workspace: Path,
    output: Path,
    milestone: str,
) -> dict[str, Any]:
    contract = _read_json(contract_path)
    findings = _validate_contract(contract, milestone)
    required = _required_layer_ids(contract, milestone)
    canvas = (contract["canvas"]["width"], contract["canvas"]["height"])
    loaded: dict[str, Image.Image] = {}
    inventory: list[dict[str, Any]] = []

    for layer in contract["layers"]:
        layer_id = layer["id"]
        if layer_id not in required:
            continue
        layer_path = workspace / layer["file"]
        if not layer_path.is_file():
            findings.append(Finding("error", "layer.missing", f"{layer_id}: missing {layer['file']}"))
            continue
        try:
            image = Image.open(layer_path)
            image.load()
        except Exception as error:  # Pillow supplies format-specific context.
            findings.append(Finding("error", "layer.decode", f"{layer_id}: {error}"))
            continue

        if image.size != canvas:
            findings.append(Finding("error", "layer.canvas", f"{layer_id}: {image.size} != {canvas}"))
        if layer["alpha"] == "required" and "A" not in image.getbands():
            findings.append(Finding("error", "layer.alpha", f"{layer_id}: transparent RGBA export required"))
        if layer["alpha"] == "opaque" and "A" in image.getbands() and image.getchannel("A").getextrema()[0] < 255:
            findings.append(Finding("error", "layer.opaque", f"{layer_id}: contains transparent pixels"))

        bbox = _alpha_bbox(image)
        allowed = layer.get("allowedAlphaBounds")
        if bbox and allowed and not _inside(bbox, allowed):
            findings.append(Finding("error", "layer.bounds", f"{layer_id}: alpha bounds {bbox} escape {allowed}"))

        loaded[layer_id] = image.convert("RGBA")
        inventory.append(
            {
                "layerID": layer_id,
                "file": layer["file"],
                "sha256": _sha256(layer_path),
                "alphaBounds": bbox,
            }
        )

    output.mkdir(parents=True, exist_ok=True)
    composite_path: Path | None = None
    parity: dict[str, Any] | None = None
    if required.issubset(loaded):
        composite = Image.new("RGBA", canvas, (0, 0, 0, 0))
        by_id = {layer["id"]: layer for layer in contract["layers"]}
        for layer_id in sorted(required, key=lambda item: (by_id[item]["zIndex"], item)):
            composite.alpha_composite(loaded[layer_id])
        composite_path = output / f"{milestone}-composite.png"
        composite.save(composite_path)

        reference_path = (contract_path.parent / contract["referenceComposite"]).resolve()
        if reference_path.is_file():
            reference = Image.open(reference_path).convert("RGBA")
            if reference.size != canvas:
                findings.append(Finding("error", "reference.canvas", f"reference {reference.size} != {canvas}"))
            else:
                difference = ImageChops.difference(reference, composite)
                stat = ImageStat.Stat(difference)
                mae = sum(stat.mean[:3]) / 3.0
                red, green, blue = difference.convert("RGB").split()
                changed_mask = ImageChops.lighter(ImageChops.lighter(red, green), blue)
                changed = canvas[0] * canvas[1] - changed_mask.histogram()[0]
                ratio = changed / float(canvas[0] * canvas[1])
                parity = {"meanAbsoluteError": mae, "changedPixelRatio": ratio}
                limits = contract["referenceParity"]
                if mae > limits["maxMeanAbsoluteError"] or ratio > limits["maxChangedPixelRatio"]:
                    findings.append(
                        Finding(
                            "error",
                            "reference.drift",
                            f"default recomposition drifted: MAE={mae:.4f}, changed={ratio:.4%}",
                        )
                    )
        else:
            findings.append(Finding("error", "reference.missing", f"missing reference {reference_path}"))

    report = {
        "contract": str(contract_path),
        "workspace": str(workspace),
        "milestone": milestone,
        "passed": not any(item.severity == "error" for item in findings),
        "composite": str(composite_path) if composite_path else None,
        "referenceParity": parity,
        "inventory": sorted(inventory, key=lambda item: item["layerID"]),
        "findings": [item.as_dict() for item in findings],
    }
    report_path = output / "layered-master-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("contract", type=Path)
    parser.add_argument("workspace", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--milestone", choices=("decomposition", "mvp"), default="decomposition")
    arguments = parser.parse_args()

    try:
        report = verify(arguments.contract.resolve(), arguments.workspace.resolve(), arguments.output.resolve(), arguments.milestone)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
