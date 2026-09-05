from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
import tempfile
from dataclasses import dataclass
from datetime import date
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence

from jsonschema import Draft202012Validator, FormatChecker
from PIL import Image, ImageChops


HASH_PATTERN = re.compile(r"^sha256:[0-9a-f]{64}$")
DIAGNOSTIC_BACKGROUNDS = (
    (255, 255, 255, 255),
    (0, 0, 0, 255),
    (16, 112, 104, 255),
    (242, 145, 0, 255),
)

MANIFEST_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["schemaVersion", "posture", "sockets", "layers", "optionGroups"],
    "properties": {
        "schemaVersion": {"const": 2},
        "posture": {
            "type": "object",
            "required": [
                "id", "baseVersion", "canvas", "coordinateOrigin",
                "fixedLayerAssetIDs", "supportedSlots", "defaultSelections",
            ],
            "properties": {
                "id": {"type": "string", "minLength": 1},
                "baseVersion": {"type": "string", "minLength": 1},
                "coordinateOrigin": {"const": "topLeft"},
                "canvas": {
                    "type": "object",
                    "required": ["width", "height"],
                    "properties": {
                        "width": {"type": "integer", "minimum": 1},
                        "height": {"type": "integer", "minimum": 1},
                    },
                },
                "fixedLayerAssetIDs": {"type": "array", "items": {"type": "string"}},
                "supportedSlots": {
                    "type": "array", "minItems": 1,
                    "items": {"type": "string", "pattern": "^[a-z][a-zA-Z0-9]*$"},
                },
                "defaultSelections": {
                    "type": "object", "additionalProperties": {"type": "string"},
                },
            },
        },
        "sockets": {
            "type": "array", "minItems": 1,
            "items": {
                "type": "object",
                "required": [
                    "socketID", "slot", "anchor", "fitMask",
                    "requiredLayerRoles", "occluderLayerAssetIDs",
                ],
                "properties": {
                    "socketID": {"type": "string", "minLength": 1},
                    "slot": {"type": "string", "pattern": "^[a-z][a-zA-Z0-9]*$"},
                    "anchor": {
                        "type": "object", "required": ["x", "y"],
                        "properties": {
                            "x": {"type": "integer", "minimum": 0},
                            "y": {"type": "integer", "minimum": 0},
                        },
                    },
                    "fitMask": {
                        "type": "object", "required": ["file", "frame", "contentHash"],
                        "properties": {
                            "file": {"type": "string", "minLength": 1},
                            "frame": {"$ref": "#/$defs/frame"},
                            "contentHash": {"type": "string"},
                        },
                    },
                    "requiredLayerRoles": {
                        "type": "array", "minItems": 1, "uniqueItems": True,
                        "items": {"type": "string", "minLength": 1},
                    },
                    "occluderLayerAssetIDs": {
                        "type": "array", "uniqueItems": True,
                        "items": {"type": "string"},
                    },
                },
            },
        },
        "layers": {
            "type": "array", "minItems": 1,
            "items": {
                "type": "object",
                "required": [
                    "assetID", "file", "frame", "zIndex", "blendMode",
                    "occludedBy", "requires", "excludes", "contentHash", "rights",
                ],
                "properties": {
                    "assetID": {"type": "string", "minLength": 1},
                    "file": {"type": "string", "minLength": 1},
                    "frame": {"$ref": "#/$defs/frame"},
                    "zIndex": {"type": "integer"},
                    "blendMode": {"const": "normal"},
                    "occludedBy": {"type": "array", "items": {"type": "string"}},
                    "requires": {"type": "array", "items": {"type": "string"}},
                    "excludes": {"type": "array", "items": {"type": "string"}},
                    "contentHash": {"type": "string"},
                    "rights": {
                        "type": "object",
                        "required": ["author", "sourceAgreement", "aiAssisted"],
                        "properties": {
                            "author": {"type": "string", "minLength": 1},
                            "sourceAgreement": {"type": "string", "minLength": 1},
                            "aiAssisted": {"type": "boolean"},
                        },
                    },
                },
            },
        },
        "optionGroups": {
            "type": "array", "minItems": 1,
            "items": {
                "type": "object",
                "required": [
                    "optionID", "slot", "socketID", "displayName", "layerBindings",
                    "compatiblePostures", "thumbnail", "referenceComposite",
                    "collectionTags", "technicalReview", "culturalReview",
                ],
                "properties": {
                    "optionID": {"type": "string", "minLength": 1},
                    "slot": {"type": "string", "minLength": 1},
                    "socketID": {"type": "string", "minLength": 1},
                    "displayName": {"type": "string", "minLength": 1},
                    "layerBindings": {
                        "type": "array", "minItems": 1,
                        "items": {
                            "type": "object", "required": ["role", "assetID"],
                            "properties": {
                                "role": {"type": "string", "minLength": 1},
                                "assetID": {"type": "string", "minLength": 1},
                            },
                        },
                    },
                    "compatiblePostures": {
                        "type": "array", "minItems": 1, "items": {"type": "string"},
                    },
                    "thumbnail": {"type": "string", "minLength": 1},
                    "referenceComposite": {"type": "string", "minLength": 1},
                    "collectionTags": {"type": "array", "items": {"type": "string"}},
                    "requires": {"type": "array", "items": {"type": "string"}},
                    "excludes": {"type": "array", "items": {"type": "string"}},
                    "technicalReview": {"$ref": "#/$defs/review"},
                    "culturalReview": {"$ref": "#/$defs/review"},
                },
            },
        },
        "qa": {
            "type": "object",
            "properties": {
                "highRiskPairs": {
                    "type": "array",
                    "items": {
                        "type": "array", "minItems": 2, "maxItems": 2,
                        "items": {"type": "string"},
                    },
                },
            },
        },
    },
    "$defs": {
        "frame": {
            "type": "object",
            "required": ["x", "y", "width", "height"],
            "properties": {
                "x": {"type": "integer", "minimum": 0},
                "y": {"type": "integer", "minimum": 0},
                "width": {"type": "integer", "minimum": 1},
                "height": {"type": "integer", "minimum": 1},
            },
        },
        "review": {
            "type": "object",
            "required": ["status", "reviewer", "date"],
            "properties": {
                "status": {"enum": ["approved", "pending"]},
                "reviewer": {"type": "string"},
                "date": {"type": "string"},
            },
        },
    },
}


@dataclass(frozen=True)
class Problem:
    code: str
    message: str
    subject: str | None = None

    def json(self) -> dict[str, str]:
        result = {"code": self.code, "message": self.message}
        if self.subject is not None:
            result["subject"] = self.subject
        return result


@dataclass
class Inspection:
    image: Image.Image
    alpha_bounds: tuple[int, int, int, int] | None
    transparent_rgb_pixels: int


class ValidationPolicy(str, Enum):
    RELEASE = "release"
    DEVELOPMENT = "development"


class AssetPackQA:
    """Owns Asset Pack validation, deterministic assembly, and QA evidence."""

    def __init__(
        self,
        manifest_path: Path,
        policy: ValidationPolicy = ValidationPolicy.RELEASE,
    ):
        self.manifest_path = manifest_path.resolve()
        self.root = self.manifest_path.parent
        self.policy = policy
        self.manifest: dict[str, Any] = {}
        self.problems: list[Problem] = []
        self.warnings: list[Problem] = []
        self.inspections: dict[str, Inspection] = {}

    def validate(self) -> None:
        try:
            self.manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            self.problems.append(Problem("manifest_unreadable", str(error), str(self.manifest_path)))
            return

        validator = Draft202012Validator(MANIFEST_SCHEMA, format_checker=FormatChecker())
        schema_errors = sorted(
            validator.iter_errors(self.manifest),
            key=lambda item: tuple(str(part) for part in item.path),
        )
        for error in schema_errors:
            subject = ".".join(str(part) for part in error.path) or "manifest"
            self.problems.append(Problem("schema_violation", error.message, subject))
        if schema_errors:
            return

        posture = self.manifest["posture"]
        canvas = posture["canvas"]
        sockets = self.manifest["sockets"]
        layers = self.manifest["layers"]
        options = self.manifest["optionGroups"]
        sockets_by_id = self._unique_map(sockets, "socketID", "duplicate_socket_id")
        layers_by_id = self._unique_map(layers, "assetID", "duplicate_asset_id")
        options_by_id = self._unique_map(options, "optionID", "duplicate_option_id")
        self._check_unique_files(layers)
        self._validate_reviews(posture, options)

        fixed_ids = set(posture["fixedLayerAssetIDs"])
        option_layer_ids = {
            asset_id for option in options for asset_id in _option_layer_ids(option)
        }
        all_referenced = fixed_ids | option_layer_ids
        for asset_id in sorted(all_referenced - layers_by_id.keys()):
            self.problems.append(Problem("unresolved_layer", "Referenced layer does not exist.", asset_id))
        for asset_id in sorted(layers_by_id.keys() - all_referenced):
            self.problems.append(Problem("orphan_layer", "Layer is neither fixed nor part of a Variant.", asset_id))

        for layer in layers:
            self._inspect_layer(layer, canvas, layer["assetID"] in option_layer_ids)
            for occluder in layer["occludedBy"]:
                if occluder not in layers_by_id:
                    self.problems.append(Problem("missing_occluder", "Occluder does not resolve.", occluder))
                elif layers_by_id[occluder]["zIndex"] <= layer["zIndex"]:
                    self.problems.append(Problem(
                        "invalid_occluder_order", "Occluder must render above the occluded layer.",
                        f"{layer['assetID']} -> {occluder}",
                    ))

        slots = set(posture["supportedSlots"])
        if len(slots) != len(posture["supportedSlots"]):
            self.problems.append(Problem("duplicate_slot", "Supported Customization Slots must be unique."))
        for socket in sockets:
            self._validate_socket(socket, layers_by_id, slots, canvas)
        for option in options:
            self._validate_option(
                option, options_by_id, layers_by_id, sockets_by_id, slots, posture["id"]
            )
            socket = sockets_by_id.get(option["socketID"])
            if socket is not None:
                self._validate_locked_fit_containment(option, socket, layers_by_id, canvas)
        for slot in sorted(slots):
            default_id = posture["defaultSelections"].get(slot)
            option = options_by_id.get(default_id)
            if option is None or option["slot"] != slot:
                self.problems.append(Problem("invalid_default", "Default Variant does not resolve for its slot.", slot))

        for pair in self.manifest.get("qa", {}).get("highRiskPairs", []):
            selected = [options_by_id.get(option_id) for option_id in pair]
            if any(option is None for option in selected):
                self.problems.append(Problem("invalid_high_risk_pair", "Pair contains an unknown Variant.", " / ".join(pair)))
            elif selected[0]["slot"] == selected[1]["slot"]:
                self.problems.append(Problem("invalid_high_risk_pair", "Pair must span two Customization Slots.", " / ".join(pair)))

        if not self.problems:
            self._check_composition_z_indices()

    def render_compositions(self) -> dict[str, Image.Image]:
        posture = self.manifest["posture"]
        options = self.manifest["optionGroups"]
        defaults = dict(posture["defaultSelections"])
        compositions = {"default.png": self._compose(defaults)}
        for option in sorted(options, key=lambda item: (item["slot"], item["optionID"])):
            selections = dict(defaults)
            selections[option["slot"]] = option["optionID"]
            name = f"{_safe_name(option['slot'])}__{_safe_name(option['optionID'])}.png"
            compositions[name] = self._compose(selections)
        options_by_id = {option["optionID"]: option for option in options}
        for first_id, second_id in self.manifest.get("qa", {}).get("highRiskPairs", []):
            selections = dict(defaults)
            selections[options_by_id[first_id]["slot"]] = first_id
            selections[options_by_id[second_id]["slot"]] = second_id
            name = f"pair__{_safe_name(first_id)}__{_safe_name(second_id)}.png"
            compositions[name] = self._compose(selections)
        return dict(sorted(compositions.items()))

    def write_contact_sheets(self, directory: Path) -> int:
        directory.mkdir(parents=True, exist_ok=True)
        option_layer_ids = {
            layer_id
            for option in self.manifest.get("optionGroups", [])
            for layer_id in _option_layer_ids(option)
        }
        count = 0
        for layer_id in sorted(option_layer_ids):
            inspection = self.inspections.get(layer_id)
            if inspection is None:
                continue
            foreground = inspection.image.convert("RGBA")
            width, height = foreground.size
            sheet = Image.new("RGBA", (width * 2, height * 2))
            for index, color in enumerate(DIAGNOSTIC_BACKGROUNDS):
                background = Image.new("RGBA", foreground.size, color)
                background.alpha_composite(foreground)
                sheet.paste(background, ((index % 2) * width, (index // 2) * height))
            _save_png(sheet, directory / f"{_safe_name(layer_id)}.png")
            count += 1
        return count

    def report(self, *, status: str, contact_sheets: int = 0) -> dict[str, Any]:
        pending_reviews = self._pending_review_subjects()
        return {
            "schemaVersion": 1,
            "status": status,
            "packID": self.manifest.get("posture", {}).get("id"),
            "manifest": str(self.manifest_path),
            "validationPolicy": self.policy.value,
            "reviewStatus": "pending" if pending_reviews else "approved",
            "releaseEligible": (
                status == "passed"
                and self.policy == ValidationPolicy.RELEASE
                and not pending_reviews
                and self._has_complete_posture_reviews()
            ),
            "counts": {
                "layers": len(self.manifest.get("layers", [])),
                "options": len(self.manifest.get("optionGroups", [])),
                "contactSheets": contact_sheets,
            },
            "problems": [problem.json() for problem in self.problems],
            "warnings": [warning.json() for warning in self.warnings],
            "alphaBounds": {
                asset_id: list(inspection.alpha_bounds) if inspection.alpha_bounds else None
                for asset_id, inspection in sorted(self.inspections.items())
                if inspection.image.mode == "RGBA"
            },
        }

    def _validate_reviews(
        self,
        posture: Mapping[str, Any],
        options: Sequence[Mapping[str, Any]],
    ) -> None:
        entries: list[tuple[str, str, Mapping[str, Any]]] = []
        for label in ("technicalReview", "culturalReview"):
            review = posture.get(label)
            if review is not None:
                entries.append((posture["id"], label, review))
        for option in options:
            for label in ("technicalReview", "culturalReview"):
                entries.append((option["optionID"], label, option[label]))

        for subject, label, review in entries:
            status = review["status"]
            if status == "pending":
                problem = Problem(
                    "pending_review",
                    f"{label} is pending; this Asset Pack is not release eligible.",
                    subject,
                )
                if self.policy == ValidationPolicy.RELEASE:
                    self.problems.append(problem)
                else:
                    self.warnings.append(problem)
            elif (
                not review["reviewer"].strip()
                or not review["date"].strip()
                or not _is_iso_date(review["date"])
            ):
                self.problems.append(Problem(
                    "invalid_approved_review",
                    f"Approved {label} requires a reviewer and ISO-8601 date.",
                    subject,
                ))

    def _pending_review_subjects(self) -> list[str]:
        posture = self.manifest.get("posture", {})
        reviews = [
            posture.get("technicalReview"), posture.get("culturalReview"),
        ]
        for option in self.manifest.get("optionGroups", []):
            reviews.extend([option.get("technicalReview"), option.get("culturalReview")])
        return [
            str(index) for index, review in enumerate(reviews)
            if isinstance(review, Mapping) and review.get("status") == "pending"
        ]

    def _has_complete_posture_reviews(self) -> bool:
        posture = self.manifest.get("posture", {})
        return all(
            isinstance(posture.get(label), Mapping)
            and posture[label].get("status") == "approved"
            and bool(str(posture[label].get("reviewer", "")).strip())
            and bool(str(posture[label].get("date", "")).strip())
            for label in ("technicalReview", "culturalReview")
        )

    def _unique_map(
        self, values: list[dict[str, Any]], key: str, error_code: str
    ) -> dict[str, dict[str, Any]]:
        result: dict[str, dict[str, Any]] = {}
        for value in values:
            identity = value[key]
            if identity in result:
                self.problems.append(Problem(error_code, f"Duplicate {key}.", identity))
            else:
                result[identity] = value
        return result

    def _check_unique_files(self, layers: list[dict[str, Any]]) -> None:
        seen: set[str] = set()
        for layer in layers:
            file_name = layer["file"]
            if file_name in seen:
                self.problems.append(Problem("duplicate_runtime_file", "Runtime layer files must be unique.", file_name))
            seen.add(file_name)

    def _inspect_layer(
        self, layer: dict[str, Any], canvas: Mapping[str, int], swappable: bool
    ) -> None:
        asset_id = layer["assetID"]
        frame = layer["frame"]
        if frame["x"] + frame["width"] > canvas["width"] or frame["y"] + frame["height"] > canvas["height"]:
            self.problems.append(Problem("frame_outside_canvas", "Canonical frame exceeds the Base Murti canvas.", asset_id))
        if not HASH_PATTERN.fullmatch(layer["contentHash"]):
            self.problems.append(Problem("invalid_content_hash", "Content hash must be lowercase sha256.", asset_id))

        path = self.root / layer["file"]
        if not path.is_file():
            self.problems.append(Problem("missing_file", "Runtime PNG does not exist.", layer["file"]))
            return
        digest = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != layer["contentHash"]:
            self.problems.append(Problem("content_hash_mismatch", "Runtime PNG content differs from the manifest hash.", asset_id))
        try:
            with Image.open(path) as decoded:
                decoded.load()
                if decoded.format != "PNG":
                    self.problems.append(Problem("runtime_file_not_png", "Runtime layer must decode as PNG.", asset_id))
                image = decoded.copy()
        except (OSError, ValueError) as error:
            self.problems.append(Problem("image_decode_failed", str(error), asset_id))
            return

        if image.mode not in {"RGB", "RGBA"}:
            self.problems.append(Problem("invalid_color_model", "Runtime PNG must be 8-bit RGB or RGBA.", asset_id))
        if image.size != (frame["width"], frame["height"]):
            self.problems.append(Problem("frame_size_mismatch", "PNG dimensions do not match the canonical frame.", asset_id))

        alpha_bounds = None
        transparent_rgb_pixels = 0
        if "A" in image.getbands():
            rgba = image.convert("RGBA")
            alpha = rgba.getchannel("A")
            alpha_bounds = alpha.getbbox()
            alpha_min, alpha_max = alpha.getextrema()
            red, green, blue, _ = rgba.split()
            rgb_maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue)
            transparent_mask = alpha.point(lambda value: 255 if value == 0 else 0)
            colored_transparency = ImageChops.multiply(rgb_maximum, transparent_mask)
            transparent_histogram = colored_transparency.histogram()
            transparent_rgb_pixels = sum(transparent_histogram[1:])
            if alpha_bounds is None:
                self.problems.append(Problem("empty_alpha", "Layer has no visible pixels.", asset_id))
            if swappable and alpha_min == 255:
                self.problems.append(Problem("opaque_swappable_layer", "Swappable layer contains no transparent pixels.", asset_id))
            if transparent_rgb_pixels:
                self.problems.append(Problem(
                    "transparent_rgb_fringe", "Fully transparent pixels contain RGB color that can bleed during scaling.", asset_id,
                ))
            if alpha_bounds and (
                alpha_bounds[0] == 0 or alpha_bounds[1] == 0
                or alpha_bounds[2] == image.width or alpha_bounds[3] == image.height
            ):
                self.warnings.append(Problem("alpha_touches_crop_edge", "Visible pixels touch the cropped layer edge; verify authored bleed.", asset_id))
        elif swappable:
            self.problems.append(Problem("swappable_requires_alpha", "Swappable layer must have an alpha channel.", asset_id))
        self.inspections[asset_id] = Inspection(image, alpha_bounds, transparent_rgb_pixels)

    def _validate_option(
        self,
        option: dict[str, Any],
        options_by_id: Mapping[str, dict[str, Any]],
        layers_by_id: Mapping[str, dict[str, Any]],
        sockets_by_id: Mapping[str, dict[str, Any]],
        slots: set[str],
        posture_id: str,
    ) -> None:
        option_id = option["optionID"]
        if option["slot"] not in slots:
            self.problems.append(Problem("unsupported_slot", "Variant uses an unsupported Customization Slot.", option_id))
        if posture_id not in option["compatiblePostures"]:
            self.problems.append(Problem("incompatible_posture", "Variant is not fitted to this Base Murti.", option_id))
        socket = sockets_by_id.get(option["socketID"])
        if socket is None:
            self.problems.append(Problem("unresolved_socket", "Variant socket does not resolve.", option_id))
        elif socket["slot"] != option["slot"]:
            self.problems.append(Problem("socket_slot_mismatch", "Variant and socket must use the same slot.", option_id))
        else:
            roles = [binding["role"] for binding in option["layerBindings"]]
            if len(roles) != len(set(roles)):
                self.problems.append(Problem("duplicate_layer_role", "Variant binds one socket role more than once.", option_id))
            if set(roles) != set(socket["requiredLayerRoles"]):
                self.problems.append(Problem("missing_layer_role", "Variant bindings must exactly satisfy the socket roles.", option_id))
        for layer_id in _option_layer_ids(option):
            if layer_id not in layers_by_id:
                self.problems.append(Problem("unresolved_option_layer", "Variant layer does not resolve.", f"{option_id} -> {layer_id}"))
        for requirement in option.get("requires", []):
            if not requirement.startswith("posture:") and requirement not in options_by_id:
                self.problems.append(Problem("unresolved_requirement", "Variant requirement does not resolve.", f"{option_id} -> {requirement}"))
        for excluded in option.get("excludes", []):
            other = options_by_id.get(excluded)
            if other is None or option_id not in other.get("excludes", []):
                self.problems.append(Problem("asymmetric_exclusion", "Variant exclusions must be symmetric.", f"{option_id} / {excluded}"))
        for file_field in ("thumbnail", "referenceComposite"):
            path = self.root / option[file_field]
            if not path.is_file():
                self.problems.append(Problem("missing_review_artifact", f"{file_field} does not exist.", option_id))
            else:
                try:
                    with Image.open(path) as image:
                        image.verify()
                except OSError as error:
                    self.problems.append(Problem("invalid_review_artifact", str(error), option_id))

    def _validate_socket(
        self,
        socket: dict[str, Any],
        layers_by_id: Mapping[str, dict[str, Any]],
        slots: set[str],
        canvas: Mapping[str, int],
    ) -> None:
        socket_id = socket["socketID"]
        if socket["slot"] not in slots:
            self.problems.append(Problem("unsupported_socket_slot", "Socket uses an unsupported slot.", socket_id))
        anchor = socket["anchor"]
        if anchor["x"] >= canvas["width"] or anchor["y"] >= canvas["height"]:
            self.problems.append(Problem("socket_anchor_outside_canvas", "Socket anchor lies outside the canonical canvas.", socket_id))
        for occluder_id in socket["occluderLayerAssetIDs"]:
            if occluder_id not in layers_by_id:
                self.problems.append(Problem("missing_socket_occluder", "Socket occluder does not resolve.", f"{socket_id} -> {occluder_id}"))
        if "fitGeometry" in socket:
            self._validate_fit_geometry(socket, canvas)
        self._inspect_fit_mask(socket, canvas)

    def _validate_fit_geometry(
        self, socket: dict[str, Any], canvas: Mapping[str, int]
    ) -> None:
        socket_id = socket["socketID"]
        geometry = socket["fitGeometry"]
        if socket["slot"] == "crown" and geometry.get("model") == "tiltedHeadwearFitV1":
            landmarks = geometry.get("landmarks", {})
            required = {"leftTemple", "rightTemple", "hairlineCenter", "apex"}
            clearance = geometry.get("clearance", {})
            required_clearance = {"tilakTop", "leftEarTop", "rightEarTop"}
            if set(landmarks) != required or set(clearance) != required_clearance:
                self.problems.append(Problem(
                    "invalid_fit_landmarks",
                    "Crown fit requires temple, hairline, apex, tilak, and ear landmarks.",
                    socket_id,
                ))
                return
            points = list(landmarks.values()) + list(clearance.values())
            if any(
                point["x"] < 0 or point["y"] < 0
                or point["x"] >= canvas["width"] or point["y"] >= canvas["height"]
                for point in points
            ):
                self.problems.append(Problem(
                    "fit_geometry_outside_canvas",
                    "Crown landmarks or clearance points are invalid.",
                    socket_id,
                ))
                return
            left = landmarks["leftTemple"]
            right = landmarks["rightTemple"]
            center = landmarks["hairlineCenter"]
            apex = landmarks["apex"]
            rotation = geometry.get("authoredRotationDegrees")
            tuning = geometry.get("authoringTuning", {})
            if not (
                left["x"] < center["x"] < right["x"]
                and apex["y"] < center["y"]
                and isinstance(rotation, (int, float))
                and -45 <= rotation <= 45
                and clearance["leftEarTop"]["x"] < left["x"]
                and clearance["rightEarTop"]["x"] > right["x"]
                and clearance["tilakTop"]["y"] >= center["y"]
                and tuning.get("status") == "locked"
                and tuning.get("policy")
                == "anatomicalLandmarksPreserveSilhouetteV1"
            ):
                self.problems.append(Problem(
                    "invalid_crown_fit_geometry",
                    "Crown fit landmarks do not define a safe tilted headwear envelope.",
                    socket_id,
                ))
            if socket["anchor"] != center:
                self.problems.append(Problem(
                    "invalid_crown_anchor",
                    "Crown anchor must equal the fitted hairline center.",
                    socket_id,
                ))
            return
        garland_models = {"threePointAffineV1", "twoCurveGarlandFitV1"}
        if socket["slot"] != "garland" or geometry.get("model") not in garland_models:
            self.problems.append(Problem(
                "unsupported_fit_geometry", "Socket uses unsupported fit geometry.", socket_id
            ))
            return
        landmarks = geometry.get("landmarks", {})
        required = {"leftAttach", "rightAttach", "centerDrop"}
        if set(landmarks) != required:
            self.problems.append(Problem(
                "invalid_fit_landmarks", "Garland fit requires left, right, and drop landmarks.", socket_id
            ))
            return
        polygon = geometry.get("trunkOccluderPolygon", [])
        points = list(landmarks.values()) + polygon
        if len(polygon) < 3 or any(
            point["x"] < 0 or point["y"] < 0
            or point["x"] >= canvas["width"] or point["y"] >= canvas["height"]
            for point in points
        ):
            self.problems.append(Problem(
                "fit_geometry_outside_canvas", "Garland landmarks or occluder polygon are invalid.", socket_id
            ))
            return
        left = landmarks["leftAttach"]
        right = landmarks["rightAttach"]
        drop = landmarks["centerDrop"]
        if not (
            left["x"] < drop["x"] < right["x"]
            and drop["y"] > max(left["y"], right["y"])
            and socket["occluderLayerAssetIDs"]
        ):
            self.problems.append(Problem(
                "invalid_garland_fit_geometry", "Garland attachment triangle or occlusion contract is invalid.", socket_id
            ))
            return
        if geometry.get("model") == "threePointAffineV1":
            return

        path = geometry.get("pathAuthoring", {})
        left_controls = path.get("leftControlPoints", [])
        right_controls = path.get("rightControlPoints", [])
        tuning = geometry.get("authoringTuning", {})
        controls = [*left_controls, *right_controls]
        if (
            path.get("model") != "asymmetricTwoCubicBezierPathV1"
            or path.get("placement") != "equalArcLengthTangentAligned"
            or len(left_controls) != 2
            or len(right_controls) != 2
            or not isinstance(path.get("endpointTaper"), (int, float))
            or not 0 < path["endpointTaper"] <= 1
            or tuning.get("status") != "locked"
            or tuning.get("policy")
            != "sharedAnatomicalSocketPreserveRhythmV1"
        ):
            self.problems.append(Problem(
                "invalid_garland_path_geometry",
                "Garland path fit requires locked two-curve equal-arc authoring geometry.",
                socket_id,
            ))
            return
        if any(
            point["x"] < 0 or point["y"] < 0
            or point["x"] >= canvas["width"] or point["y"] >= canvas["height"]
            for point in controls
        ):
            self.problems.append(Problem(
                "fit_geometry_outside_canvas",
                "Garland path control points are outside the canonical canvas.",
                socket_id,
            ))
        expected_anchor = {
            # Canonical coordinates are non-negative integers. Match the Swift
            # runtime by rounding exact half-pixel midpoints upward.
            "x": (left["x"] + right["x"] + 1) // 2,
            "y": (left["y"] + right["y"] + 1) // 2,
        }
        if socket["anchor"] != expected_anchor:
            self.problems.append(Problem(
                "invalid_garland_anchor",
                "Garland anchor must be the rounded midpoint of both attachments.",
                socket_id,
            ))

    def _validate_locked_fit_containment(
        self,
        option: dict[str, Any],
        socket: dict[str, Any],
        layers_by_id: Mapping[str, dict[str, Any]],
        canvas: Mapping[str, int],
    ) -> None:
        """Require locked-fit Variant pixels to stay inside their pose envelope."""
        geometry = socket.get("fitGeometry") or {}
        tuning = geometry.get("authoringTuning") or {}
        if tuning.get("status") != "locked":
            return

        try:
            with Image.open(self.root / socket["fitMask"]["file"]) as decoded:
                mask_alpha = decoded.convert("RGBA").getchannel("A")
        except (OSError, ValueError):
            return

        canvas_size = (canvas["width"], canvas["height"])
        allowed = Image.new("L", canvas_size, 0)
        mask_frame = socket["fitMask"]["frame"]
        allowed.paste(
            mask_alpha.point(lambda value: 255 if value else 0),
            (mask_frame["x"], mask_frame["y"]),
        )
        forbidden = ImageChops.invert(allowed)

        for binding in option["layerBindings"]:
            asset_id = binding["assetID"]
            layer = layers_by_id.get(asset_id)
            inspection = self.inspections.get(asset_id)
            if layer is None or inspection is None:
                continue
            occupied = Image.new("L", canvas_size, 0)
            alpha = inspection.image.convert("RGBA").getchannel("A")
            occupied.paste(
                alpha.point(lambda value: 255 if value else 0),
                (layer["frame"]["x"], layer["frame"]["y"]),
            )
            if ImageChops.multiply(occupied, forbidden).getbbox() is not None:
                self.problems.append(Problem(
                    "layer_outside_fit_mask",
                    "Locked-fit Variant pixels must stay inside the socket fit mask.",
                    f"{option['optionID']} -> {asset_id}",
                ))

    def _inspect_fit_mask(
        self, socket: dict[str, Any], canvas: Mapping[str, int]
    ) -> None:
        socket_id = socket["socketID"]
        mask = socket["fitMask"]
        frame = mask["frame"]
        if frame["x"] + frame["width"] > canvas["width"] or frame["y"] + frame["height"] > canvas["height"]:
            self.problems.append(Problem("fit_mask_outside_canvas", "Fit mask exceeds the canonical canvas.", socket_id))
        path = self.root / mask["file"]
        if not path.is_file():
            self.problems.append(Problem("missing_fit_mask", "Socket fit mask does not exist.", socket_id))
            return
        digest = "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
        if not HASH_PATTERN.fullmatch(mask["contentHash"]):
            self.problems.append(Problem("invalid_fit_mask_hash", "Fit-mask hash must be lowercase sha256.", socket_id))
        elif digest != mask["contentHash"]:
            self.problems.append(Problem("fit_mask_hash_mismatch", "Fit-mask pixels differ from the manifest hash.", socket_id))
        try:
            with Image.open(path) as decoded:
                decoded.load()
                image = decoded.copy()
        except (OSError, ValueError) as error:
            self.problems.append(Problem("fit_mask_decode_failed", str(error), socket_id))
            return
        if image.format is not None and image.format != "PNG":
            self.problems.append(Problem("fit_mask_not_png", "Fit mask must decode as PNG.", socket_id))
        if image.size != (frame["width"], frame["height"]):
            self.problems.append(Problem("fit_mask_size_mismatch", "Fit-mask dimensions do not match its frame.", socket_id))
        if "A" not in image.getbands() or image.convert("RGBA").getchannel("A").getbbox() is None:
            self.problems.append(Problem("empty_fit_mask", "Fit mask requires usable nonzero alpha.", socket_id))

    def _check_composition_z_indices(self) -> None:
        for name, layers in self._resolved_layer_sets():
            z_indices: dict[int, str] = {}
            for layer in layers:
                existing = z_indices.get(layer["zIndex"])
                if existing is not None:
                    self.problems.append(Problem(
                        "ambiguous_z_index", "Layers visible together may not share a z-index.",
                        f"{name}: {existing} / {layer['assetID']}",
                    ))
                z_indices[layer["zIndex"]] = layer["assetID"]

    def _resolved_layer_sets(self) -> Iterable[tuple[str, list[dict[str, Any]]]]:
        defaults = self.manifest["posture"]["defaultSelections"]
        yield "default", self._resolve_layers(defaults)
        for option in self.manifest["optionGroups"]:
            selections = dict(defaults)
            selections[option["slot"]] = option["optionID"]
            yield option["optionID"], self._resolve_layers(selections)

    def _resolve_layers(self, selections: Mapping[str, str]) -> list[dict[str, Any]]:
        layers_by_id = {layer["assetID"]: layer for layer in self.manifest["layers"]}
        options_by_id = {option["optionID"]: option for option in self.manifest["optionGroups"]}
        ids = list(self.manifest["posture"]["fixedLayerAssetIDs"])
        for slot in sorted(self.manifest["posture"]["supportedSlots"]):
            ids.extend(_option_layer_ids(options_by_id[selections[slot]]))
        unique_ids = list(dict.fromkeys(ids))
        return sorted((layers_by_id[asset_id] for asset_id in unique_ids), key=lambda layer: (layer["zIndex"], layer["assetID"]))

    def _compose(self, selections: Mapping[str, str]) -> Image.Image:
        canvas_size = self.manifest["posture"]["canvas"]
        canvas = Image.new("RGBA", (canvas_size["width"], canvas_size["height"]), (0, 0, 0, 0))
        for layer in self._resolve_layers(selections):
            inspection = self.inspections[layer["assetID"]]
            frame = layer["frame"]
            canvas.alpha_composite(inspection.image.convert("RGBA"), (frame["x"], frame["y"]))
        return canvas


def _option_layer_ids(option: Mapping[str, Any]) -> list[str]:
    return [binding["assetID"] for binding in option["layerBindings"]]


def _safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", value).strip("-")


def _save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False, compress_level=9)


def _write_report(path: Path, report: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _validated_pipeline(
    manifest: Path,
    output: Path,
    policy: ValidationPolicy = ValidationPolicy.RELEASE,
) -> tuple[AssetPackQA, dict[str, Any]]:
    pipeline = AssetPackQA(manifest, policy=policy)
    pipeline.validate()
    contact_count = 0
    if pipeline.manifest:
        contact_count = pipeline.write_contact_sheets(output / "contact-sheets")
    status = "failed" if pipeline.problems else "passed"
    report = pipeline.report(status=status, contact_sheets=contact_count)
    return pipeline, report


def _is_iso_date(value: str) -> bool:
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _validate_command(args: argparse.Namespace) -> int:
    output = Path(args.output)
    _, report = _validated_pipeline(Path(args.manifest), output, ValidationPolicy(args.policy))
    _write_report(output / "qa-report.json", report)
    return 0 if report["status"] == "passed" else 1


def _render_command(args: argparse.Namespace) -> int:
    output = Path(args.output)
    pipeline, report = _validated_pipeline(
        Path(args.manifest), output, ValidationPolicy(args.policy)
    )
    if report["status"] == "passed":
        compositions = pipeline.render_compositions()
        for name, image in compositions.items():
            _save_png(image, output / "goldens" / name)
        report["goldens"] = {
            name: "sha256:" + hashlib.sha256((output / "goldens" / name).read_bytes()).hexdigest()
            for name in compositions
        }
    _write_report(output / "qa-report.json", report)
    return 0 if report["status"] == "passed" else 1


def _verify_command(args: argparse.Namespace) -> int:
    output = Path(args.output)
    pipeline, report = _validated_pipeline(
        Path(args.manifest), output, ValidationPolicy(args.policy)
    )
    verification: dict[str, Any] = {}
    if report["status"] == "passed":
        expected_directory = Path(args.goldens)
        compositions = pipeline.render_compositions()
        for name, actual in compositions.items():
            expected_path = expected_directory / name
            if not expected_path.is_file():
                pipeline.problems.append(Problem("missing_golden", "Expected golden is missing.", name))
                verification[name] = {"changedPixels": actual.width * actual.height, "maxChannelDifference": 255}
                continue
            try:
                with Image.open(expected_path) as source:
                    expected = source.convert("RGBA")
            except OSError as error:
                pipeline.problems.append(Problem("invalid_golden", str(error), name))
                continue
            if expected.size != actual.size:
                changed = max(expected.width * expected.height, actual.width * actual.height)
                maximum = 255
                diff = Image.new("RGBA", actual.size, (255, 0, 255, 255))
            else:
                diff = ImageChops.difference(expected, actual)
                red, green, blue, alpha = diff.split()
                maximum_channel = ImageChops.lighter(
                    ImageChops.lighter(red, green), ImageChops.lighter(blue, alpha)
                )
                histogram = maximum_channel.histogram()
                changed = sum(histogram[1:])
                maximum = max(
                    (value for value, count in enumerate(histogram) if count),
                    default=0,
                )
            verification[name] = {"changedPixels": changed, "maxChannelDifference": maximum}
            if changed:
                pipeline.problems.append(Problem("golden_drift", "Rendered pixels differ from the approved golden.", name))
                _save_png(diff, output / "diffs" / name)
        expected_names = {path.name for path in expected_directory.glob("*.png")}
        for name in sorted(expected_names - compositions.keys()):
            pipeline.problems.append(Problem("unexpected_golden", "Golden has no corresponding composition.", name))

    report = pipeline.report(
        status="failed" if pipeline.problems else "passed",
        contact_sheets=report["counts"]["contactSheets"],
    )
    report["goldenVerification"] = verification
    _write_report(output / "qa-report.json", report)
    return 0 if report["status"] == "passed" else 1


def _runtime_references(manifest_path: Path, manifest: Mapping[str, Any]) -> dict[str, set[str]]:
    references: dict[str, set[str]] = {manifest_path.name: {"manifest"}}
    for layer in manifest["layers"]:
        references.setdefault(layer["file"], set()).add("layer")
    for socket in manifest["sockets"]:
        references.setdefault(socket["fitMask"]["file"], set()).add("fitMask")
    for option in manifest["optionGroups"]:
        references.setdefault(option["thumbnail"], set()).add("thumbnail")
    return references


def _is_safe_runtime_reference(root: Path, relative: str) -> bool:
    if not relative or "\\" in relative:
        return False
    path = PurePosixPath(relative)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        return False
    if path.as_posix() != relative or relative == "runtime-pack-report.json":
        return False
    try:
        (root / Path(*path.parts)).resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _stage_runtime_command(args: argparse.Namespace) -> int:
    manifest_path = Path(args.manifest).resolve()
    if manifest_path.name == "runtime-pack-report.json":
        return 1
    try:
        unvalidated_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        unvalidated_references = _runtime_references(manifest_path, unvalidated_manifest)
    except (OSError, json.JSONDecodeError, KeyError, TypeError):
        return 1
    if any(
        not _is_safe_runtime_reference(manifest_path.parent, relative)
        for relative in unvalidated_references
    ):
        return 1

    pipeline = AssetPackQA(manifest_path, policy=ValidationPolicy(args.policy))
    pipeline.validate()
    if pipeline.problems:
        return 1
    validation_report = pipeline.report(status="passed")

    unresolved_output = Path(args.output)
    if unresolved_output.is_symlink():
        return 1
    output = unresolved_output.resolve()
    if (
        output == manifest_path.parent
        or output.is_relative_to(manifest_path.parent)
        or manifest_path.parent.is_relative_to(output)
    ):
        return 1
    if output.exists() and not output.is_dir():
        return 1
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent))
    backup: Path | None = None
    try:
        inventory: list[dict[str, Any]] = []
        for relative, roles in sorted(_runtime_references(manifest_path, pipeline.manifest).items()):
            source = pipeline.root / relative
            destination = temporary / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, destination)
            content = destination.read_bytes()
            inventory.append({
                "path": relative,
                "roles": sorted(roles),
                "bytes": len(content),
                "contentHash": "sha256:" + hashlib.sha256(content).hexdigest(),
            })

        report = {
            "schemaVersion": 1,
            "status": "passed",
            "packID": pipeline.manifest["posture"]["id"],
            "validationPolicy": pipeline.policy.value,
            "reviewStatus": validation_report["reviewStatus"],
            "releaseEligible": validation_report["releaseEligible"],
            "counts": {
                "files": len(inventory),
                "bytes": sum(item["bytes"] for item in inventory),
            },
            "inventory": inventory,
        }
        _write_report(temporary / "runtime-pack-report.json", report)
        if output.exists():
            backup = Path(tempfile.mkdtemp(prefix=f".{output.name}-previous-", dir=output.parent))
            backup.rmdir()
            output.replace(backup)
        try:
            temporary.replace(output)
        except OSError:
            if backup is not None and backup.exists() and not output.exists():
                backup.replace(output)
            return 1
        if backup is not None:
            shutil.rmtree(backup)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate, render, and stage Ganpati Studio Asset Packs."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate", help="Validate a v2 manifest and emit QA evidence.")
    validate.add_argument("manifest")
    validate.add_argument("--output", required=True)
    validate.add_argument("--policy", choices=[item.value for item in ValidationPolicy], default="release")
    validate.set_defaults(handler=_validate_command)

    render = commands.add_parser("render-goldens", help="Render approved deterministic compositions.")
    render.add_argument("manifest")
    render.add_argument("--output", required=True)
    render.add_argument("--policy", choices=[item.value for item in ValidationPolicy], default="release")
    render.set_defaults(handler=_render_command)

    verify = commands.add_parser("verify-goldens", help="Compare deterministic renders to approved goldens.")
    verify.add_argument("manifest")
    verify.add_argument("--goldens", required=True)
    verify.add_argument("--output", required=True)
    verify.add_argument("--policy", choices=[item.value for item in ValidationPolicy], default="release")
    verify.set_defaults(handler=_verify_command)

    stage = commands.add_parser(
        "stage-runtime",
        help="Validate an authoring pack and stage only files required at runtime.",
    )
    stage.add_argument("manifest")
    stage.add_argument("--output", required=True)
    stage.add_argument("--policy", choices=[item.value for item in ValidationPolicy], default="release")
    stage.set_defaults(handler=_stage_runtime_command)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        return int(args.handler(args))
    except (KeyError, TypeError, ValueError) as error:
        print(f"asset pipeline failed: {error}", file=sys.stderr)
        return 2
