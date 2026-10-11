# Garland attachment and fit research

Status: implementation research
Research date: 2026-08-09
Scope: fitting necklaces and garlands to one fixed 2D murti base. This complements `CHARACTER_CUSTOMIZATION_RESEARCH.md` by focusing on the concrete attachment, deformation, masking, metadata, and validation contract.

## Findings

### 1. Treat the murti base as the mannequin

Roblox requires accessory authors to design against body scale, attachment orientation, and mannequin proportions, and it defines size budgets for accessory types such as neck, shoulder, front, back, and waist; the useful 2D translation is to make the approved murti artboard the only canonical mannequin and reject garlands that are authored against ad hoc screenshots. Source: https://create.roblox.com/docs/avatar/rigid-accessories/specifications

Use named sockets rather than per-asset pixel nudges. Unreal Paper 2D sprites support named sprite sockets with local transforms, and Epic calls out that the socket name matters because the runtime references that name when attaching other objects. Source: https://dev.epicgames.com/documentation/unreal-engine/paper-2d-sprite-sockets-in-unreal-engine

For a fixed murti, one socket is not enough for a garland. Use a socket group: `neckCenter`, `leftCollar`, `rightCollar`, `leftShoulderDrop`, `rightShoulderDrop`, `chestLow`, and optional `trunkCrossing`. Roblox's own attachment table separates neck, collar, shoulder, front, back, and waist attachment names, which supports modeling the fit area as multiple named body landmarks rather than a single anchor. Source: https://create.roblox.com/docs/avatar/layered-accessories/specifications

Store anchors in normalized artboard space, for example `{ "x": 0.512, "y": 0.318 }`, and convert to pixels at render time. Quartz 2D separates user space from device space, represents coordinates as floating-point values, and maps between spaces through transforms, so normalized canonical coordinates are compatible with Core Graphics rendering. Source: https://developer.apple.com/library/archive/documentation/GraphicsImaging/Conceptual/drawingwithquartz2d/dq_overview/dq_overview.html

Apple's own UI/game APIs also use unit-style coordinates where appropriate: `SKSpriteNode.anchorPoint` is documented as a normalized point in the sprite's coordinate system, and SwiftUI `UnitPoint` represents a point in a normalized coordinate space. These are precedents for storing murti sockets as resolution-independent normalized values, while still rendering through pixel transforms later. Sources: https://developer.apple.com/documentation/spritekit/skspritenode/anchorpoint and https://developer.apple.com/documentation/swiftui/unitpoint

Do not let asset image resolution become the coordinate system. Unreal has a project setting to resize sprite data authored in texture space when source textures change, explicitly including sockets, pivots, render geometry, and collision geometry; that is a warning that socket data must have a declared coordinate basis and migration behavior. Source: https://dev.epicgames.com/documentation/unreal-engine/paper-2d-settings-in-the-unreal-engine-project-settings

### 2. Fit garlands with paths, not rectangles

A garland should be authored against a canonical necklace curve, not just placed in a bounding box. Core Graphics paths can represent Bezier curves, and Quartz draws paths by adding them to a graphics context and painting them, which is enough for a deterministic centerline used by validation overlays and fitted bead placement. Source: https://developer.apple.com/library/archive/documentation/GraphicsImaging/Conceptual/drawingwithquartz2d/dq_paths/dq_paths.html

For simple garlands, render repeated flowers or beads along the canonical path by sampling the path offline into points and tangents, then place each bead with local rotation and scale. Apple APIs provide paths, transforms, and image drawing, but they do not provide an automatic "place sprites along this Bezier at equal arc length" accessory fitter; that sampler needs to be app or toolchain code. Sources: https://developer.apple.com/library/archive/documentation/GraphicsImaging/Conceptual/drawingwithquartz2d/dq_affine/dq_affine.html and https://developer.apple.com/documentation/swiftui/graphicscontext

For painted full-garland PNGs, use multi-point deformation. SpriteKit has `SKWarpGeometryGrid`, which defines matching source and destination positions over a 2D grid, and `SKAction.warp(to:duration:)` can distort a warpable node using that geometry. This can bend a raster garland into the murti's neck/chest silhouette when the app owns the control grid, but it does not infer those destination points from the image automatically. Sources: https://developer.apple.com/documentation/spritekit/skwarpgeometrygrid and https://developer.apple.com/documentation/spritekit/skaction/warp%28to%3Aduration%3A%29

Core Image is a lower-level option for custom warps: `CIWarpKernel` is a GPU image-processing routine for geometry, and `apply(extent:roiCallback:image:arguments:)` requires the app to provide the output extent, region-of-interest callback, input image, and arguments. This supports custom deterministic deformation, but not semantic necklace fitting by itself. Sources: https://developer.apple.com/documentation/coreimage/ciwarpkernel and https://developer.apple.com/documentation/coreimage/ciwarpkernel/apply%28extent%3Aroicallback%3Aimage%3Aarguments%3A%29

Unity's 2D Animation package is a useful first-party analogy: its Skinning Editor creates bones, mesh geometry, and weights, while Sprite Skin deforms a sprite using bones rigged and weighted to that sprite. For this murti app, the equivalent is not a full animated skeleton; it is a tiny authored garland mesh or strip with control points bound to the socket group. Sources: https://docs.unity3d.com/Packages/com.unity.2d.animation%408.0/manual/SkinningEditor.html and https://docs.unity3d.com/Packages/com.unity.2d.animation%4016.0/manual/SpriteSkin.html

Godot's 2D skeleton documentation makes the same authoring point from another first-party engine: polygon deformation requires a skeleton and a one-time synchronization of bones to the polygon before weight painting, and the `Polygon2D` class exposes a `skeleton` path for skeleton-based deformation. For this app, that supports storing the garland's deformation handles as asset metadata rather than trying to warp a flat PNG with no control structure. Sources: https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html and https://docs.godotengine.org/en/stable/classes/class_polygon2d.html

### 3. Segment front, back, and occlusion explicitly

Layered accessories in Roblox must contain inner and outer cage data and be weighted to a rigging armature so they stretch and layer over bodies. The 2D equivalent for a garland is an authored `back` layer behind the neck/shoulders, one or more `front` layers over the chest, and masks that decide where trunk, hands, belly, and garment edges hide the accessory. Source: https://create.roblox.com/docs/avatar/layered-accessories/specifications

SwiftUI and Core Graphics can apply masks and clipping, but the mask shape must be supplied. SwiftUI `mask` uses another view's alpha as the mask, `clipShape` preserves the parts covered by a shape, and Core Graphics has `clip(to:mask:)` for image masks; none of these APIs discovers that the trunk should pass over the garland unless the app provides that occlusion mask. Sources: https://developer.apple.com/documentation/swiftui/view/mask%28alignment%3A_%3A%29, https://developer.apple.com/documentation/swiftui/view/clipshape%28_%3Astyle%3A%29, and https://developer.apple.com/documentation/coregraphics/cgcontext/clip%28to%3Amask%3A%29

SpriteKit's `SKCropNode` is another runtime option: Apple documents it as masking pixels drawn by child nodes, with a `maskNode` rendered into a private buffer before the children. This is suitable for preview-time front/back visibility tests, but the same mask asset should also be used by the export renderer so preview and share output match. Sources: https://developer.apple.com/documentation/spritekit/cropping-nodes and https://developer.apple.com/documentation/spritekit/skcropnode/masknode

Unity Sprite Masks provide the same engine-level precedent for explicit 2D visibility control: Unity documents Sprite Masks as a way to hide or reveal parts of sprites or groups of sprites. That reinforces using authored murti occluder masks instead of relying on layer order alone for trunk, hands, and drape crossings. Source: https://docs.unity3d.com/6000.5/Documentation/Manual/sprite/mask/mask-landing.html

Use z-order as data, not view ordering scattered through SwiftUI. SpriteKit exposes `zPosition` for node ordering, and Unreal sockets are named local attachment points; the app should resolve the final order from metadata such as `baseBack`, `garlandBack`, `body`, `garlandFront`, `trunkFront`, `handFront`, and `highlight`. Sources: https://developer.apple.com/documentation/spritekit/sknode/zposition and https://dev.epicgames.com/documentation/unreal-engine/paper-2d-sprite-sockets-in-unreal-engine

### 4. Author metadata as a release contract

Minimum posture metadata:

```json
{
  "postureID": "murti.bal-seated.v1",
  "artboard": { "width": 2048, "height": 2048 },
  "coordinateSpace": "normalized-top-left",
  "sockets": {
    "neckCenter": { "x": 0.505, "y": 0.315 },
    "leftCollar": { "x": 0.405, "y": 0.345 },
    "rightCollar": { "x": 0.604, "y": 0.345 },
    "chestLow": { "x": 0.510, "y": 0.560 }
  },
  "occluders": ["trunkFront.v1", "leftHandFront.v1", "rightHandFront.v1"],
  "fitMasks": ["neckSafe.v1", "chestSafe.v1"]
}
```

Minimum garland metadata:

```json
{
  "assetID": "garland.marigold.long.v1",
  "slot": "garland",
  "compatiblePostures": ["murti.bal-seated.v1"],
  "fitMode": "path-sampled-beads",
  "socketGroup": ["leftCollar", "neckCenter", "rightCollar", "chestLow"],
  "canonicalPath": "garland.marigold.long.path.json",
  "layers": [
    { "role": "back", "file": "garland.marigold.long.back.png", "zBand": "garlandBack" },
    { "role": "front", "file": "garland.marigold.long.front.png", "zBand": "garlandFront" }
  ],
  "masks": { "visibleInside": "chestSafe.v1", "occludedBy": ["trunkFront.v1", "handFront.v1"] },
  "boundsNormalized": { "minX": 0.31, "minY": 0.28, "maxX": 0.70, "maxY": 0.67 },
  "review": { "technical": "approved", "cultural": "approved" }
}
```

This schema borrows from first-party engine patterns: Roblox validates object hierarchy, tags, attributes, mesh geometry, texture/materials, rigging/skinning, cages, and attachments; Unity Sprite Swap requires category and label metadata and identical skeleton data for skeletal swaps; Unreal sprites expose named sockets with local transforms. Sources: https://create.roblox.com/docs/marketplace/validation-system, https://docs.unity3d.com/Packages/com.unity.2d.animation%406.0/manual/SpriteSwapIntro.html, and https://dev.epicgames.com/documentation/unreal-engine/paper-2d-sprite-editor-in-unreal-engine

### 5. Validate deterministically before catalog ingest

Validation should fail missing files, nonmatching content hashes, missing socket IDs, duplicate z-order ties, unsupported posture IDs, bounds outside `[0, 1]`, masks with a different artboard size, and alpha outside the declared fit mask. Roblox's validation system is the direct precedent: it checks schema, geometry, textures/materials, rigging/skinning, cages, and attachments before marketplace upload. Source: https://create.roblox.com/docs/marketplace/validation-system

Garland-specific validation should compute a curve-fit score: every sampled bead center must stay within the declared neck/chest safe mask except where explicitly marked as hidden by an occluder. Roblox's cage validation measures cage-to-mesh distance, cage relevancy, and cage UV correctness; the 2D equivalent is distance from the garland centerline to the approved murti guide curve, percentage of visible pixels outside safe masks, and percentage of mask/curve metadata unused by the asset. Source: https://create.roblox.com/docs/marketplace/validation-system

Run visual tests at the final phone preview size and export size. Roblox supplies visualization checks for validation errors and warnings, and Unity requires identical skeletons for skeletal sprite swaps to avoid bad runtime results; for this app, golden composites and pixel-diff thresholds should prove that each garland still fits after asset compression, device scaling, and renderer changes. Sources: https://create.roblox.com/docs/marketplace/validation-system and https://docs.unity3d.com/Packages/com.unity.2d.animation%406.0/manual/SpriteSwapIntro.html

### 6. Apple API boundary

Apple APIs can render the system once the app supplies the contract: Core Graphics can transform coordinate spaces, draw paths/images, clip to masks, and composite layers; SwiftUI `Canvas` can draw rich 2D graphics; SpriteKit can order nodes, crop children with masks, and warp sprites using supplied geometry; Core Image can run custom image warps. Sources: https://developer.apple.com/library/archive/documentation/GraphicsImaging/Conceptual/drawingwithquartz2d/dq_affine/dq_affine.html, https://developer.apple.com/documentation/swiftui/canvas, https://developer.apple.com/documentation/spritekit/cropping-nodes, https://developer.apple.com/documentation/spritekit/skwarpgeometrygrid, and https://developer.apple.com/documentation/coreimage/ciwarpkernel

Apple APIs cannot automatically decide where a devotional garland belongs, infer named sockets from painted art, split a necklace into front/back segments, know that the trunk or hands should occlude part of it, equalize bead spacing along a semantic neck curve, or certify cultural correctness. Those decisions must live in authored metadata, masks, validation rules, and reviewed assets; the cited Apple APIs expose drawing, masking, transforms, and warping primitives rather than avatar accessory semantics. Sources: https://developer.apple.com/documentation/coregraphics/cgcontext/clip%28to%3Amask%3A%29, https://developer.apple.com/documentation/swiftui/view/mask%28alignment%3A_%3A%29, https://developer.apple.com/documentation/spritekit/skwarpgeometrygrid, and https://developer.apple.com/documentation/coreimage/ciwarpkernel

## Recommended implementation path

1. Define `murti.bal-seated.v1` with a normalized socket group, approved guide curves, safe masks, and fixed occluder masks.
2. Support two fit modes first: `path-sampled-beads` for bead/flower garlands and `grid-warped-raster` for painted full-garland art.
3. Require each garland to submit `back` and `front` layers or explicitly declare `singlePlane: true` with a technical-review waiver.
4. Build an ingest validator that renders a diagnostic overlay: sockets, guide curve, sampled bead centers, visible-outside-safe-mask pixels, and occluded pixels.
5. Store golden composites for every garland against the fixed base, plus pairwise tests for high-risk occluders such as trunk, hands, drape, and crown/neck overlap.
