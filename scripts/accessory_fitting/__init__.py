"""Deterministic authoring-time accessory fitting modules."""

from .garland import (
    Centerpiece,
    GarlandDesign,
    GarlandSocket,
    Point,
    fit_garland,
    garland_fit_envelope,
)
from .headwear import HeadwearDesign, HeadwearSocket, WearableBand, fit_headwear
from .outfit import (
    FittedOutfit,
    OutfitDesign,
    OutfitSocket,
    fit_outfit,
    isolate_outfit_composite,
)
from .scene import AuthoredScene, author_scene_variant

__all__ = [
    "Centerpiece",
    "GarlandDesign",
    "GarlandSocket",
    "HeadwearDesign",
    "HeadwearSocket",
    "FittedOutfit",
    "OutfitDesign",
    "OutfitSocket",
    "AuthoredScene",
    "Point",
    "WearableBand",
    "fit_garland",
    "fit_headwear",
    "fit_outfit",
    "isolate_outfit_composite",
    "author_scene_variant",
    "garland_fit_envelope",
]
