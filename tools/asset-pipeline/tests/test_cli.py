from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image

from ganpati_asset_pipeline import main


def _save(path: Path, image: Image.Image) -> str:
    image.save(path, format="PNG")
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _pack(tmp_path: Path) -> Path:
    base_hash = _save(tmp_path / "base.png", Image.new("RGB", (8, 8), "#f5dfc1"))

    crown = Image.new("RGBA", (4, 3), (0, 0, 0, 0))
    crown.putpixel((1, 1), (220, 130, 20, 255))
    crown.putpixel((2, 1), (250, 190, 30, 128))
    crown_hash = _save(tmp_path / "crown.png", crown)

    alternate = Image.new("RGBA", (4, 3), (0, 0, 0, 0))
    alternate.putpixel((1, 1), (25, 110, 85, 255))
    alternate.putpixel((2, 1), (55, 160, 110, 128))
    alternate_hash = _save(tmp_path / "crown-alternate.png", alternate)

    fit_mask = Image.new("RGBA", (4, 3), (0, 0, 0, 0))
    fit_mask.putpixel((1, 1), (255, 255, 255, 255))
    fit_mask.putpixel((2, 1), (255, 255, 255, 255))
    fit_mask_hash = _save(tmp_path / "crown-fit-mask.png", fit_mask)

    _save(tmp_path / "crown-thumb.png", crown.resize((8, 6)))
    _save(tmp_path / "crown-reference.png", Image.new("RGB", (8, 8), "#ead4b5"))
    _save(tmp_path / "alternate-thumb.png", alternate.resize((8, 6)))
    _save(tmp_path / "alternate-reference.png", Image.new("RGB", (8, 8), "#e0c8a8"))

    manifest = {
        "schemaVersion": 2,
        "posture": {
            "id": "murti.bal-seated.v1",
            "baseVersion": "1.0.0",
            "canvas": {"width": 8, "height": 8},
            "coordinateOrigin": "topLeft",
            "fixedLayerAssetIDs": ["fixed.base.v1"],
            "supportedSlots": ["crown"],
            "defaultSelections": {"crown": "crown.royal.v1"},
        },
        "sockets": [
            {
                "socketID": "socket.crown.bal-seated.v1",
                "slot": "crown",
                "anchor": {"x": 4, "y": 2},
                "fitMask": {
                    "file": "crown-fit-mask.png",
                    "frame": {"x": 2, "y": 1, "width": 4, "height": 3},
                    "contentHash": fit_mask_hash,
                },
                "requiredLayerRoles": ["front"],
                "occluderLayerAssetIDs": [],
            }
        ],
        "layers": [
            {
                "assetID": "fixed.base.v1",
                "file": "base.png",
                "frame": {"x": 0, "y": 0, "width": 8, "height": 8},
                "zIndex": 0,
                "blendMode": "normal",
                "occludedBy": [],
                "requires": [],
                "excludes": [],
                "contentHash": base_hash,
                "rights": {
                    "author": "Ganpati Studio",
                    "sourceAgreement": "ledger-001",
                    "aiAssisted": False,
                },
            },
            {
                "assetID": "crown.royal.front.v1",
                "file": "crown.png",
                "frame": {"x": 2, "y": 1, "width": 4, "height": 3},
                "zIndex": 850,
                "blendMode": "normal",
                "occludedBy": [],
                "requires": ["posture:murti.bal-seated.v1"],
                "excludes": [],
                "contentHash": crown_hash,
                "rights": {
                    "author": "Ganpati Studio",
                    "sourceAgreement": "ledger-002",
                    "aiAssisted": True,
                },
            },
            {
                "assetID": "crown.peacock.front.v1",
                "file": "crown-alternate.png",
                "frame": {"x": 2, "y": 1, "width": 4, "height": 3},
                "zIndex": 850,
                "blendMode": "normal",
                "occludedBy": [],
                "requires": ["posture:murti.bal-seated.v1"],
                "excludes": [],
                "contentHash": alternate_hash,
                "rights": {
                    "author": "Ganpati Studio",
                    "sourceAgreement": "ledger-003",
                    "aiAssisted": True,
                },
            },
        ],
        "optionGroups": [
            {
                "optionID": "crown.royal.v1",
                "slot": "crown",
                "socketID": "socket.crown.bal-seated.v1",
                "displayName": "Royal Mukut",
                "layerBindings": [
                    {"role": "front", "assetID": "crown.royal.front.v1"}
                ],
                "compatiblePostures": ["murti.bal-seated.v1"],
                "thumbnail": "crown-thumb.png",
                "referenceComposite": "crown-reference.png",
                "collectionTags": ["royal", "gold"],
                "technicalReview": {
                    "status": "approved",
                    "reviewer": "Art Lead",
                    "date": "2026-08-09",
                },
                "culturalReview": {
                    "status": "approved",
                    "reviewer": "Cultural Reviewer",
                    "date": "2026-08-09",
                },
            },
            {
                "optionID": "crown.peacock.v1",
                "slot": "crown",
                "socketID": "socket.crown.bal-seated.v1",
                "displayName": "Peacock Mukut",
                "layerBindings": [
                    {"role": "front", "assetID": "crown.peacock.front.v1"}
                ],
                "compatiblePostures": ["murti.bal-seated.v1"],
                "thumbnail": "alternate-thumb.png",
                "referenceComposite": "alternate-reference.png",
                "collectionTags": ["peacock", "green"],
                "technicalReview": {
                    "status": "approved",
                    "reviewer": "Art Lead",
                    "date": "2026-08-09",
                },
                "culturalReview": {
                    "status": "approved",
                    "reviewer": "Cultural Reviewer",
                    "date": "2026-08-09",
                },
            },
        ],
    }
    path = tmp_path / "manifest.v2.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    return path


def _lock_crown_fit(manifest: Path) -> dict[str, object]:
    source = json.loads(manifest.read_text())
    source["sockets"][0]["fitGeometry"] = {
        "model": "tiltedHeadwearFitV1",
        "coordinateSpace": "canonicalPixelsTopLeft",
        "landmarks": {
            "leftTemple": {"x": 3, "y": 3},
            "rightTemple": {"x": 5, "y": 2},
            "hairlineCenter": {"x": 4, "y": 2},
            "apex": {"x": 4, "y": 0},
        },
        "authoredRotationDegrees": 12.0,
        "authoringTuning": {
            "status": "locked",
            "policy": "anatomicalLandmarksPreserveSilhouetteV1",
        },
        "clearance": {
            "tilakTop": {"x": 4, "y": 3},
            "leftEarTop": {"x": 2, "y": 3},
            "rightEarTop": {"x": 6, "y": 2},
        },
    }
    return source


def _lock_garland_fit(manifest: Path) -> dict[str, object]:
    source = json.loads(manifest.read_text())
    source["posture"]["supportedSlots"] = ["garland"]
    source["posture"]["defaultSelections"] = {"garland": "crown.royal.v1"}
    source["layers"][0]["zIndex"] = 900
    for layer in source["layers"][1:]:
        layer["occludedBy"] = ["fixed.base.v1"]
    socket = source["sockets"][0]
    socket["slot"] = "garland"
    socket["anchor"] = {"x": 4, "y": 2}
    socket["occluderLayerAssetIDs"] = ["fixed.base.v1"]
    socket["fitGeometry"] = {
        "model": "twoCurveGarlandFitV1",
        "coordinateSpace": "canonicalPixelsTopLeft",
        "landmarks": {
            "leftAttach": {"x": 3, "y": 2},
            "rightAttach": {"x": 5, "y": 2},
            "centerDrop": {"x": 4, "y": 6},
        },
        "pathAuthoring": {
            "model": "asymmetricTwoCubicBezierPathV1",
            "placement": "equalArcLengthTangentAligned",
            "endpointTaper": 0.7,
            "leftControlPoints": [{"x": 2, "y": 3}, {"x": 3, "y": 5}],
            "rightControlPoints": [{"x": 6, "y": 3}, {"x": 5, "y": 5}],
        },
        "authoringTuning": {
            "status": "locked",
            "policy": "sharedAnatomicalSocketPreserveRhythmV1",
        },
        "trunkOccluderPolygon": [
            {"x": 4, "y": 1}, {"x": 6, "y": 1}, {"x": 6, "y": 3}
        ],
    }
    for option in source["optionGroups"]:
        option["slot"] = "garland"
    return source


def test_validate_writes_machine_report_and_diagnostic_contact_sheets(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    output = tmp_path / "qa"

    assert main(["validate", str(manifest), "--output", str(output)]) == 0

    report = json.loads((output / "qa-report.json").read_text())
    assert report["status"] == "passed"
    assert report["packID"] == "murti.bal-seated.v1"
    assert report["counts"] == {"layers": 3, "options": 2, "contactSheets": 2}
    assert (output / "contact-sheets" / "crown.royal.front.v1.png").exists()
    assert (output / "contact-sheets" / "crown.peacock.front.v1.png").exists()


def test_development_validation_accepts_pending_reviews_but_marks_pack_non_release(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    source = json.loads(manifest.read_text())
    pending = {"status": "pending", "reviewer": "", "date": ""}
    source["posture"]["technicalReview"] = pending
    source["posture"]["culturalReview"] = pending
    for option in source["optionGroups"]:
        option["technicalReview"] = pending
        option["culturalReview"] = pending
    manifest.write_text(json.dumps(source), encoding="utf-8")
    output = tmp_path / "qa"

    assert main([
        "validate", str(manifest), "--output", str(output),
        "--policy", "development",
    ]) == 0

    report = json.loads((output / "qa-report.json").read_text())
    assert report["status"] == "passed"
    assert report["validationPolicy"] == "development"
    assert report["releaseEligible"] is False
    assert report["reviewStatus"] == "pending"
    assert {warning["code"] for warning in report["warnings"]} == {"pending_review"}


def test_release_validation_rejects_pending_reviews_by_default(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    source = json.loads(manifest.read_text())
    source["optionGroups"][0]["culturalReview"] = {
        "status": "pending", "reviewer": "", "date": "",
    }
    manifest.write_text(json.dumps(source), encoding="utf-8")
    output = tmp_path / "qa"

    assert main(["validate", str(manifest), "--output", str(output)]) == 1

    report = json.loads((output / "qa-report.json").read_text())
    assert report["validationPolicy"] == "release"
    assert report["releaseEligible"] is False
    assert report["reviewStatus"] == "pending"
    assert {problem["code"] for problem in report["problems"]} == {"pending_review"}


def test_validate_rejects_hash_drift_and_an_opaque_swappable_layer(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    source = json.loads(manifest.read_text())
    source["layers"][1]["contentHash"] = "sha256:" + "0" * 64
    Image.new("RGB", (4, 3), "gold").save(tmp_path / "crown.png")
    manifest.write_text(json.dumps(source), encoding="utf-8")

    output = tmp_path / "qa"
    assert main(["validate", str(manifest), "--output", str(output)]) == 1

    report = json.loads((output / "qa-report.json").read_text())
    assert report["status"] == "failed"
    codes = {problem["code"] for problem in report["problems"]}
    assert {"content_hash_mismatch", "swappable_requires_alpha"} <= codes


def test_validate_rejects_wrong_dimensions_and_empty_alpha_bounds(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    source = json.loads(manifest.read_text())
    source["layers"][1]["contentHash"] = _save(
        tmp_path / "crown.png", Image.new("RGBA", (5, 3), (0, 0, 0, 0))
    )
    manifest.write_text(json.dumps(source), encoding="utf-8")

    output = tmp_path / "qa"
    assert main(["validate", str(manifest), "--output", str(output)]) == 1

    report = json.loads((output / "qa-report.json").read_text())
    codes = {problem["code"] for problem in report["problems"]}
    assert {"frame_size_mismatch", "empty_alpha"} <= codes


def test_validate_rejects_a_missing_socket_fit_mask(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    (tmp_path / "crown-fit-mask.png").unlink()

    output = tmp_path / "qa"
    assert main(["validate", str(manifest), "--output", str(output)]) == 1

    report = json.loads((output / "qa-report.json").read_text())
    assert "missing_fit_mask" in {problem["code"] for problem in report["problems"]}


def test_locked_crown_fit_requires_the_hairline_anchor(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    source = _lock_crown_fit(manifest)
    source["sockets"][0]["anchor"] = {"x": 5, "y": 2}
    manifest.write_text(json.dumps(source), encoding="utf-8")

    output = tmp_path / "qa"
    assert main(["validate", str(manifest), "--output", str(output)]) == 1

    report = json.loads((output / "qa-report.json").read_text())
    assert "invalid_crown_anchor" in {
        problem["code"] for problem in report["problems"]
    }


def test_locked_fit_rejects_variant_pixels_outside_the_pose_mask(
    tmp_path: Path,
) -> None:
    manifest = _pack(tmp_path)
    source = _lock_crown_fit(manifest)
    fit_mask = Image.new("RGBA", (4, 3), (0, 0, 0, 0))
    fit_mask.putpixel((1, 1), (255, 255, 255, 255))
    source["sockets"][0]["fitMask"]["contentHash"] = _save(
        tmp_path / "crown-fit-mask.png", fit_mask
    )
    manifest.write_text(json.dumps(source), encoding="utf-8")

    output = tmp_path / "qa"
    assert main(["validate", str(manifest), "--output", str(output)]) == 1

    report = json.loads((output / "qa-report.json").read_text())
    assert "layer_outside_fit_mask" in {
        problem["code"] for problem in report["problems"]
    }


def test_two_curve_garland_fit_requires_locked_equal_arc_geometry(
    tmp_path: Path,
) -> None:
    manifest = _pack(tmp_path)
    source = _lock_garland_fit(manifest)
    source["sockets"][0]["fitGeometry"]["pathAuthoring"]["placement"] = "equalParameter"
    source["sockets"][0]["fitGeometry"]["authoringTuning"]["status"] = "pending"
    manifest.write_text(json.dumps(source), encoding="utf-8")

    output = tmp_path / "qa"
    assert main(["validate", str(manifest), "--output", str(output)]) == 1

    report = json.loads((output / "qa-report.json").read_text())
    assert "invalid_garland_path_geometry" in {
        problem["code"] for problem in report["problems"]
    }


def test_render_and_verify_goldens_are_deterministic_and_emit_a_diff(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    output = tmp_path / "qa"

    assert main(["render-goldens", str(manifest), "--output", str(output)]) == 0
    golden_names = sorted(path.name for path in (output / "goldens").glob("*.png"))
    assert golden_names == [
        "crown__crown.peacock.v1.png",
        "crown__crown.royal.v1.png",
        "default.png",
    ]
    first_hashes = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (output / "goldens").glob("*.png")
    }
    assert main(["render-goldens", str(manifest), "--output", str(output)]) == 0
    second_hashes = {
        path.name: hashlib.sha256(path.read_bytes()).hexdigest()
        for path in (output / "goldens").glob("*.png")
    }
    assert second_hashes == first_hashes

    assert main([
        "verify-goldens", str(manifest), "--goldens", str(output / "goldens"),
        "--output", str(output / "verification"),
    ]) == 0

    Image.new("RGBA", (8, 8), "black").save(output / "goldens" / "default.png")
    failed_output = output / "failed-verification"
    assert main([
        "verify-goldens", str(manifest), "--goldens", str(output / "goldens"),
        "--output", str(failed_output),
    ]) == 1
    report = json.loads((failed_output / "qa-report.json").read_text())
    assert report["status"] == "failed"
    assert report["goldenVerification"]["default.png"]["changedPixels"] > 0
    assert (failed_output / "diffs" / "default.png").exists()


def test_stage_runtime_copies_only_runtime_files_with_a_deterministic_inventory(
    tmp_path: Path,
) -> None:
    authoring = tmp_path / "authoring"
    authoring.mkdir()
    manifest = _pack(authoring)
    source = json.loads(manifest.read_text())

    moves = {
        "base.png": "layers/base.png",
        "crown.png": "layers/crown.png",
        "crown-alternate.png": "layers/crown-alternate.png",
        "crown-fit-mask.png": "fit-masks/crown.png",
        "crown-thumb.png": "thumbnails/crown.png",
        "alternate-thumb.png": "thumbnails/crown-alternate.png",
    }
    for old, new in moves.items():
        destination = authoring / new
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(authoring / old, destination)
    for layer in source["layers"]:
        layer["file"] = moves[layer["file"]]
    source["sockets"][0]["fitMask"]["file"] = moves["crown-fit-mask.png"]
    for option in source["optionGroups"]:
        option["thumbnail"] = moves[option["thumbnail"]]
    manifest.write_text(json.dumps(source, indent=2) + "\n", encoding="utf-8")

    (authoring / "goldens").mkdir()
    (authoring / "goldens" / "default.png").write_bytes(b"not-runtime")
    (authoring / "ledger.json").write_text("{}\n", encoding="utf-8")
    (authoring / "README.md").write_text("authoring only\n", encoding="utf-8")

    output = tmp_path / "runtime"
    assert main(["stage-runtime", str(manifest), "--output", str(output)]) == 0

    expected_runtime_paths = [
        "fit-masks/crown.png",
        "layers/base.png",
        "layers/crown-alternate.png",
        "layers/crown.png",
        "manifest.v2.json",
        "thumbnails/crown-alternate.png",
        "thumbnails/crown.png",
    ]
    assert sorted(
        str(path.relative_to(output)) for path in output.rglob("*") if path.is_file()
    ) == sorted(expected_runtime_paths + ["runtime-pack-report.json"])
    assert not (output / "references").exists()
    assert not (output / "goldens").exists()
    assert not (output / "ledger.json").exists()
    assert not (output / "README.md").exists()

    report_bytes = (output / "runtime-pack-report.json").read_bytes()
    report = json.loads(report_bytes)
    assert report["status"] == "passed"
    assert report["packID"] == "murti.bal-seated.v1"
    assert report["counts"] == {"files": 7, "bytes": 4825}
    assert [item["path"] for item in report["inventory"]] == expected_runtime_paths
    assert all(item["contentHash"].startswith("sha256:") for item in report["inventory"])
    assert report["inventory"][0]["roles"] == ["fitMask"]
    assert report["inventory"][4]["roles"] == ["manifest"]

    assert main(["stage-runtime", str(manifest), "--output", str(output)]) == 0
    assert (output / "runtime-pack-report.json").read_bytes() == report_bytes


def test_stage_runtime_rejects_traversal_without_replacing_the_previous_package(
    tmp_path: Path,
) -> None:
    authoring = tmp_path / "authoring"
    authoring.mkdir()
    manifest = _pack(authoring)
    source = json.loads(manifest.read_text())
    outside = tmp_path / "outside.png"
    source["layers"][0]["contentHash"] = _save(
        outside, Image.new("RGB", (8, 8), "#f5dfc1")
    )
    source["layers"][0]["file"] = "../outside.png"
    manifest.write_text(json.dumps(source), encoding="utf-8")

    output = tmp_path / "runtime"
    output.mkdir()
    (output / "previous-package.txt").write_text("keep", encoding="utf-8")

    assert main(["stage-runtime", str(manifest), "--output", str(output)]) == 1
    assert (output / "previous-package.txt").read_text(encoding="utf-8") == "keep"
    assert sorted(path.name for path in output.iterdir()) == ["previous-package.txt"]


def test_stage_runtime_rejects_a_symlink_that_escapes_the_authoring_pack(
    tmp_path: Path,
) -> None:
    authoring = tmp_path / "authoring"
    authoring.mkdir()
    manifest = _pack(authoring)
    source = json.loads(manifest.read_text())
    outside = tmp_path / "outside.png"
    source["layers"][0]["contentHash"] = _save(
        outside, Image.new("RGB", (8, 8), "#f5dfc1")
    )
    (authoring / "escaped.png").symlink_to(outside)
    source["layers"][0]["file"] = "escaped.png"
    manifest.write_text(json.dumps(source), encoding="utf-8")

    output = tmp_path / "runtime"
    assert main(["stage-runtime", str(manifest), "--output", str(output)]) == 1
    assert not output.exists()


def test_stage_runtime_preserves_development_review_status_in_its_report(
    tmp_path: Path,
) -> None:
    authoring = tmp_path / "authoring"
    authoring.mkdir()
    manifest = _pack(authoring)
    source = json.loads(manifest.read_text())
    pending = {"status": "pending", "reviewer": "", "date": ""}
    source["posture"]["technicalReview"] = pending
    source["posture"]["culturalReview"] = pending
    for option in source["optionGroups"]:
        option["technicalReview"] = pending
        option["culturalReview"] = pending
    manifest.write_text(json.dumps(source), encoding="utf-8")

    output = tmp_path / "runtime"
    assert main([
        "stage-runtime", str(manifest), "--output", str(output),
        "--policy", "development",
    ]) == 0

    report = json.loads((output / "runtime-pack-report.json").read_text())
    assert report["validationPolicy"] == "development"
    assert report["reviewStatus"] == "pending"
    assert report["releaseEligible"] is False


def test_stage_runtime_never_replaces_the_authoring_pack(tmp_path: Path) -> None:
    manifest = _pack(tmp_path)
    manifest_before = manifest.read_bytes()

    assert main([
        "stage-runtime", str(manifest), "--output", str(tmp_path),
    ]) == 1

    assert manifest.read_bytes() == manifest_before
    assert (tmp_path / "base.png").exists()
    assert not (tmp_path / "runtime-pack-report.json").exists()

    nested_output = tmp_path / "layers"
    assert main([
        "stage-runtime", str(manifest), "--output", str(nested_output),
    ]) == 1
    assert (tmp_path / "base.png").exists()
