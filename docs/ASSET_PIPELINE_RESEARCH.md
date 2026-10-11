# Ganpati Studio asset-generation pipeline

Status: recommended production direction for the fixed-posture MVP
Research date: 2026-08-08
Scope: asset authoring and delivery only; the base murti posture remains fixed after the user chooses it.

## Decision

Use an **artist-authored layered raster master, assisted by AI only for ideation and rough paint sources**. Treat the master document—not an AI prompt, seed, or generated image—as the alignment authority.

For the first interactive pack:

1. Lock one approved pose, silhouette, proportions, palette, light direction, and 2048 × 2048 master coordinate system.
2. Rebuild the murti as a socketed layered illustration: fixed body regions, replaceable anatomy/decorations, and explicit foreground occluders.
3. Export transparent PNG layers plus a manifest that places every cropped layer in master coordinates.
4. Composite the layers in a deterministic SwiftUI `Canvas`; Apple documents that `Canvas` draws images and supports masks, transforms, blend modes, and ordered graphics operations. Use `ImageRenderer` later to export the same SwiftUI composition to a bitmap. ([Apple: Canvas](https://developer.apple.com/documentation/swiftui/canvas), [Apple: GraphicsContext](https://developer.apple.com/documentation/swiftui/graphicscontext), [Apple: ImageRenderer](https://developer.apple.com/documentation/swiftui/imagerenderer))

This is the smallest pipeline that gives exact alignment, transparent parts, deterministic combinations, native iOS rendering, and a practical handoff to an illustrator.

## Why AI should not be the alignment authority

AI image editing is useful for proposing an alternate crown, eye treatment, trunk ornament, textile motif, or background while holding the approved image in context. It is not pixel-deterministic enough to emit production-ready interchangeable layers:

- OpenAI's Image API can modify all or part of an input image, supports reference-image workflows, and supports edit masks. However, OpenAI explicitly says the mask is prompt guidance and may not follow the mask shape with complete precision. ([OpenAI image generation guide](https://developers.openai.com/api/docs/guides/image-generation#edit-an-image-using-a-mask))
- The current `gpt-image-2` processes image inputs at high fidelity, but it does not currently support transparent output backgrounds. A production layer therefore still needs manual extraction, edge cleanup, repainting, and alignment. ([OpenAI image input fidelity and output options](https://developers.openai.com/api/docs/guides/image-generation#image-input-fidelity))
- Adobe Firefly can use a composition reference and a strength control to steer outline, depth, and arrangement. Adobe describes this as generating variations that *match* the reference composition, not as preserving exact pixels or anchors. Exact interchangeability must therefore be verified and corrected in the layered master. ([Adobe Firefly composition reference](https://helpx.adobe.com/firefly/web/work-with-images/generate-images/match-image-composition-to-reference-image.html))

The practical rule is: **AI may create candidates; a human artist owns final shape, joins, color, lighting, iconography, and transparency.**

## Production approaches compared

| Approach | Alignment and seams | iOS delivery | Tooling/licensing | MVP verdict |
| --- | --- | --- | --- | --- |
| Artist-authored layered raster | Strongest. Every option is authored over the same pose and verified in the same master. Painted texture, soft shading, and nuanced ornament survive well. | Transparent PNGs in asset catalogs or bundled resources; compose in SwiftUI. Apple image sets support PNG, JPEG, PDF, HEIF-family formats, while asset catalogs select appropriate resource variants. ([Apple image-set format](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/ImageSetType.html), [Apple asset catalogs](https://developer.apple.com/documentation/Xcode/managing-assets-with-asset-catalogs)) | Requires an illustrator and a layered source editor. Photoshop can export selected layers/groups as PNG and can include ICC profiles; its generated PNG assets default to 32-bit, preserving transparency/effects though effects may be flattened. ([Adobe: export layers](https://helpx.adobe.com/photoshop/desktop/save-and-export/export-files-to-different-formats/export-layers-as-files.html), [Adobe: generate image assets](https://helpx.adobe.com/photoshop/using/generate-assets-layers.html)) | **Recommended.** Lowest runtime complexity and highest art control. |
| Artist-authored vector | Excellent for flat, clean shapes; joins and anchors remain explicit. Complex painterly effects may rasterize or change appearance during export. Illustrator supports transparent PNG and SVG export, while some Illustrator effects or mesh objects rasterize in SVG workflows. ([Adobe Illustrator export](https://helpx.adobe.com/illustrator/using/exporting-artwork.html), [Adobe Illustrator SVG notes](https://helpx.adobe.com/illustrator/using/saving-artwork.html)) | Export runtime PNGs for predictable parity. PDF vector data can be preserved in an Xcode image set, but the current MVP renderer can stay format-agnostic. Apple documents `preserves-vector-representation` for PDF image sets. ([Apple image-set format](https://developer.apple.com/library/archive/documentation/Xcode/Reference/xcode_ref-Asset_Catalog_Format/ImageSetType.html)) | Good if the chosen art direction is vector-first and the artist owns the source. | Good alternative, but rasterize approved runtime layers to avoid renderer differences. |
| AI-assisted generation with references/masks | Useful for breadth, but generated edges, lighting, anatomy, and occlusion require human correction. Masks are not guaranteed to be followed precisely. ([OpenAI mask guidance](https://developers.openai.com/api/docs/guides/image-generation#edit-an-image-using-a-mask)) | Export only after manual cleanup to the same PNG/manifest contract as artist-authored assets. | Model usage adds per-generation cost. Rights still require diligence: Apple requires apps to include only content the developer created or licensed. In the US, copyright protects original human-authored expression, and the Copyright Office separately analyzes AI-output copyrightability. ([Apple App Review 5.2](https://developer.apple.com/app-store/review/guidelines/#intellectual-property), [US Copyright Office: AI](https://www.copyright.gov/ai/), [US Copyright Office: copyright basics](https://www.copyright.gov/what-is-copyright/)) | **Assistive only.** Never accept raw generations directly into the catalog. |
| Rive | Can encode hierarchy, draw order, components, runtime image swapping, and data-bound image properties. Rive's hierarchy determines draw order, and its data model supports image and artboard properties. ([Rive hierarchy](https://rive.app/docs/editor/interface-overview/hierarchy), [Rive property types](https://rive.app/docs/editor/data-binding/property-types)) | Official Apple runtime supports SwiftUI/UIKit and iOS 14+. Runtimes are MIT-licensed; production authoring/export availability depends on the current Rive plan. ([Rive Apple runtime](https://rive.app/docs/runtimes/apple/apple), [Rive runtime licensing](https://rive.app/docs/runtimes/getting-started), [Rive pricing](https://rive.app/pricing)) | Adds an authoring/runtime dependency and a second interaction model. | Not needed for static swapping. Reconsider later for a breathing/blessing idle animation after the asset vocabulary stabilizes. |
| Live2D Cubism | Powerful mesh deformation, masks, parameters, and dynamic draw order; substantially more rigging than static swapping needs. Live2D describes drawable order and parameter-controlled ordering in its editor. ([Live2D draw order](https://docs.live2d.com/en/cubism-editor-manual/draworder/)) | Native SDK exists, but its Core supplies model/vertex/render information rather than drawing functions itself. ([Live2D Core reference](https://docs.live2d.com/en/cubism-sdk-manual/cubism-core-api-reference/)) | Development starts without an initial SDK fee, but publication licensing can apply by publisher/use type and must be checked before release. ([Live2D publication licensing](https://www.live2d.com/en/sdk/license/)) | Reject for MVP. Valuable only if deformable character animation becomes a core product feature. |
| Spine | Purpose-built skeletal 2D animation, atlases, attachments, and runtime playback. | Integration uses Spine runtimes; the official license says runtime integration is governed by the Spine Editor license terms. ([Spine runtime license](https://en.esotericsoftware.com/spine-runtimes-license)) | Paid/proprietary authoring and licensing overhead relative to a static compositor. | Reject for MVP. It solves animation, not asset-generation consistency. |

## Recommended master-file structure

Use one source file per posture. For the first release there is exactly one posture source, `murti_classic_seated_v001.psd` (or an equivalent layered `.ai`/painting source plus an archival PSD).

All replaceable layers are authored at the same master scale and may not be transformed after approval. The source hierarchy should be:

```text
00_GUIDES_NOT_EXPORTED
  master-frame
  face-centerline
  eye-line
  crown-anchor
  neck-anchor
  trunk-socket
  garment-seams
10_SCENE_BACK
20_AURA_AND_BACK_PROPS
30_EARS_BACK                 one visible option
40_BODY_CORE                 fixed; excludes variable eyes/trunk pixels
45_FACE_UNDERLAY             fixed neutral fill beneath eye/trunk sockets
50_DRAPE_BACK                one visible option
60_EYES                      one visible option
65_TRUNK                     one visible option
70_DRAPE_FRONT               paired with DRAPE_BACK
75_JEWELLERY                 one visible option
80_GARLAND                   one visible option
85_CROWN                     one visible option
90_BODY_FRONT_OCCLUDERS      fixed hands/fingers or ornaments that cross variants
95_SCENE_FRONT               optional petals/lamps/foreground
99_QA_OVERLAYS_NOT_EXPORTED
```

Important art rules:

- The body core must not contain pixels for a replaceable eye, ear, or trunk. Hiding a replacement must reveal a deliberately painted neutral underlay, not a hole or old feature.
- Any option that passes behind and in front of the body is exported as a paired group, such as `drapeBack` and `drapeFront`, sharing one option ID.
- Paint 4–12 pixels of hidden overlap/bleed beneath each occluder at 2048 px master size. The exact amount is an art decision; acceptance is based on the composite having no halo at target size.
- Do not trim layers destructively in the source. Runtime exports may be cropped to alpha bounds only if their master-coordinate frame is recorded in the manifest.
- Keep blend modes simple. If the intended look relies on a source-editor effect, flatten that option group before export; Adobe notes generated asset effects may be flattened. ([Adobe Photoshop generated assets](https://helpx.adobe.com/photoshop/using/generate-assets-layers.html))
- Embed one shared RGB ICC profile in the archival/source workflow and convert all runtime exports consistently. Photoshop and Illustrator both expose ICC-profile export controls. ([Adobe Photoshop layer export](https://helpx.adobe.com/photoshop/desktop/save-and-export/export-files-to-different-formats/export-layers-as-files.html), [Adobe Illustrator export](https://helpx.adobe.com/illustrator/using/exporting-artwork.html))

## Anatomy strategy

Decorative swaps are easy because they sit above the approved body. Anatomical swaps need stricter art direction:

- **Eyes:** safe as a small overlay only when every option shares the same sockets, eyelid shadow, gaze axis, and highlight direction.
- **Ears:** place behind the head/body core where possible. Add small front ear ornaments as a separate foreground sublayer if needed.
- **Trunk:** the highest-risk independent swap. It intersects the face, mouth/tusk region, belly, hands, modak, and jewellery. Start with two trunk variants designed inside one fixed `trunk-socket`, then place fixed hands/fingers in `BODY_FRONT_OCCLUDERS` to conceal joins.
- If independent anatomy still looks assembled, use a **face kit** option that swaps eyes + ears + trunk as one approved compatible set. Keep the manifest capable of both independent slots and grouped compatibility; do not distort the base posture to force a combination.

## Small MVP catalog

Build a pilot pack before commissioning breadth:

| Slot | Pilot | MVP target | Notes |
| --- | ---: | ---: | --- |
| Base posture | 1 | 1 | Approved fixed silhouette |
| Eyes | 2 | 2 | Calm/open and gentle/half-closed |
| Ears | 2 | 2 | Same attachment socket |
| Trunk | 2 | 2 | Same direction family initially; avoid crossing different hands |
| Crown | 2 | 3 | Decorative, high visual payoff |
| Garland | 2 | 3 | Must clear hands and jewellery |
| Jewellery | 2 | 3 | Define compatibility with garlands |
| Drape | 2 | 3 | Each option may export back/front layers |
| Scene | 2 | 3 | Background plus optional foreground pair |

The pilot is 16 swappable option designs plus the fixed base and occluders. The MVP target is 22 option designs plus fixed layers. Commission and approve the pilot first; expand only after every cross-category pilot combination passes seam review.

## AI-assisted authoring loop

1. Artist supplies the approved flattened pose, socket masks, palette swatches, lighting note, and a negative list: no pose change, no extra limbs, no altered hand mudras, no text, no asymmetrical anatomy unless specified.
2. Generate one option at a time using the approved image as a high-fidelity reference and a mask around only the intended region. OpenAI supports image edits and reference-image workflows; mask files must match the edited image's format and size and contain alpha. ([OpenAI mask requirements](https://developers.openai.com/api/docs/guides/image-generation#mask-requirements))
3. Use outputs as thumbnails/reference. The artist redraws or repaints the chosen candidate on the source layer, restores exact anchors and occluded edges, and performs transparency cleanup.
4. Compare against the fixed base at 100%, 50%, and target phone size; test on light, dark, saturated, and checkerboard backgrounds.
5. Record human author, AI tool/model if used, prompts/references, source rights, review date, and approver in the asset ledger.

Adobe states Firefly's models are trained on licensed and public-domain content where copyright has expired, but this does not remove the product team's duty to verify rights to its own inputs, references, artist contract, and final output. ([Adobe Firefly approach](https://www.adobe.com/ai/overview/firefly/gen-ai-approach.html), [Apple App Review 5.2](https://developer.apple.com/app-store/review/guidelines/#intellectual-property))

## Export contract

### Runtime format

- Source: layered PSD/AI at 2048 × 2048 or larger, with the canonical 2048 square artboard represented exactly.
- Runtime: 8-bit RGBA PNG, consistently color-managed, transparent outside painted pixels.
- Preview target: provide a 1024-coordinate export first. Keep 2048 export capability for share/output QA; decide final shipping resolution after measuring memory and visual quality on the oldest supported iPhone.
- Crop runtime PNGs to alpha bounds for memory efficiency and retain exact placement in `frame`. Full-canvas PNGs are acceptable for the first integration proof because every layer naturally aligns, but should not become the permanent catalog contract.
- Use a background JPEG/opaque PNG only when the scene is guaranteed opaque; all wearable/anatomy layers remain RGBA PNG.

### Manifest example

```json
{
  "schemaVersion": 1,
  "posture": {
    "id": "murti.classic-seated.v1",
    "canvas": { "width": 2048, "height": 2048 },
    "coordinateOrigin": "topLeft",
    "defaultSelections": {
      "eyes": "eyes.calm.v1",
      "ears": "ears.classic.v1",
      "trunk": "trunk.left-soft.v1",
      "crown": "crown.marigold.v1",
      "garland": "garland.marigold.v1",
      "jewellery": "jewellery.temple-gold.v1",
      "drape": "drape.saffron.v1",
      "scene": "scene.ivory-lotus.v1"
    }
  },
  "layers": [
    {
      "assetID": "trunk.left-soft.v1",
      "slot": "trunk",
      "file": "murti_classic-seated__trunk__left-soft__v001.png",
      "frame": { "x": 724, "y": 604, "width": 510, "height": 790 },
      "zIndex": 650,
      "anchor": { "x": 0.5, "y": 0.0 },
      "requires": ["posture:murti.classic-seated.v1"],
      "excludes": [],
      "occludedBy": ["fixed.body-front-occluders.v1"],
      "contentHash": "sha256:...",
      "artReview": {
        "status": "approved",
        "reviewer": "...",
        "date": "2026-08-08"
      },
      "rights": {
        "author": "...",
        "sourceAgreement": "asset-ledger-entry-017",
        "aiAssisted": true
      }
    }
  ],
  "optionGroups": [
    {
      "optionID": "drape.saffron.v1",
      "slot": "drape",
      "layerAssetIDs": ["drape.saffron.back.v1", "drape.saffron.front.v1"]
    }
  ]
}
```

`frame` is expressed in canonical master pixels, even when the PNG is cropped. At render time, scale the canonical canvas once to the preview rectangle and apply the same transform to every frame. Never store arbitrary per-device offsets.

### Naming convention

Stable logical ID:

```text
<slot>.<descriptive-slug>.v<major>
```

File name:

```text
<posture>__<slot-or-sublayer>__<descriptive-slug>__v<zero-padded-revision>.png
```

Examples:

```text
murti_classic-seated__eyes__half-closed__v001.png
murti_classic-seated__ears-back__lotus-wide__v002.png
murti_classic-seated__drape-back__saffron__v003.png
murti_classic-seated__drape-front__saffron__v003.png
murti_classic-seated__fixed-front__hands__v001.png
scene_ivory-lotus__scene-back__base__v001.png
```

The logical ID changes only for an intentionally breaking visual revision; the file revision changes for non-breaking corrections. Avoid names based on UI position such as `option1` or mutable marketing labels.

## Acceptance checks for every asset

### Automated

- File exists and decodes as PNG.
- Color model is RGB/RGBA; every non-scene swappable layer has an alpha channel.
- Width/height match the manifest frame; frame is wholly inside the posture canvas.
- `assetID`, filename, slot, option group, and z-index are unique/valid.
- Content hash matches the bundled file.
- No visible RGB fringe outside intended alpha after compositing on white, black, teal, and marigold backgrounds.
- Every required dependency resolves; exclusions are symmetric; every default selection resolves.
- Render a golden composite for defaults and every single option over defaults. Render pairwise combinations for high-risk crossings: trunk × jewellery, trunk × drape, garland × jewellery, crown × ears, and scene-front × all.
- After validation, stage a deterministic runtime pack containing only the manifest, referenced layers, socket fit masks, and picker thumbnails. Preserve their relative paths and bytes; record a sorted SHA-256 inventory. Do not ship review composites, goldens, the rights ledger, or authoring notes in the app bundle.
- Reject absolute, parent-traversing, noncanonical, and symlink-escaping manifest paths before changing the prior staged pack. The checked-in `scripts/asset_pipeline.py stage-runtime` command is the deployment boundary for this gate.

### Visual/art direction

- Pose, silhouette, hand mudras, limb count, facial proportions, and trunk attachment remain unchanged except inside the approved slot.
- No seam, halo, pinhole, double shadow, duplicated feature, or exposed underlay at 100%, 50%, and actual iPhone preview size.
- Light direction, highlight softness, texture grain, outline weight, perspective, and palette match the approved base.
- Back/front relationships are correct around ears/head, crown/head, trunk/hands, garland/hands, jewellery/garland, and drape/body.
- The option remains legible but harmonious against every approved scene.
- Anatomy is plausible and the expression remains serene and respectful.

### Cultural and rights review

- A named Hindu cultural/religious reviewer approves the base posture and each anatomical variant; this is a product quality gate, not an automated content check.
- Avoid comedic distortion, random anatomy, inflammatory text, or inaccurate religious quotations. Apple expressly prohibits inflammatory religious commentary and inaccurate/misleading quotations of religious texts. ([Apple App Review 1.1.5](https://developer.apple.com/app-store/review/guidelines/#objectionable-content))
- Artist agreement grants the app the necessary worldwide commercial, modification, distribution, marketing, and derivative-work rights; reference images are owned, licensed, or documented as public domain.
- Asset ledger records author, source file, source/reference rights, AI assistance, model/tool, human edits, approver, and date. Apple states the developer is responsible for ensuring it created or licensed app content and may request authorization for third-party content. ([Apple App Review 5.2](https://developer.apple.com/app-store/review/guidelines/#intellectual-property))
- Obtain jurisdiction-specific legal advice before release; AI-output copyright treatment and contract requirements vary.

## Concrete rollout

### Phase 1 — one-week integration pack (planning target, not a sourced estimate)

1. Approve the fixed flattened pose and cultural review owner.
2. Commission/rebuild the socketed master with one default for every slot.
3. Export fixed base, face underlay, front occluder, and one transparent option per slot.
4. Validate manifest-driven placement in the native app.
5. Stage the validated manifest through `stage-runtime`; development-policy packs must remain explicitly non-release-eligible until both named reviews are recorded.

### Phase 2 — pilot interaction pack

1. Add a second option to all eight slots.
2. Run all single-option and high-risk pairwise golden renders.
3. Test swipe selection on the simulator and oldest supported physical iPhone.
4. Decide whether anatomy remains independent or becomes a compatible face kit.

### Phase 3 — MVP breadth

1. Expand crown, garland, jewellery, drape, and scene to three options each.
2. Keep eyes, ears, and trunk at two options until cultural and seam review proves the anatomy system.
3. Only then consider subtle Rive/Live2D/Spine motion; motion tooling must consume the same stable asset IDs or provide an explicit adapter.

## Fallback

If the current hero cannot be cleanly reconstructed into anatomy sockets without visibly changing the approved murti, ship the first interactive MVP with the **posture and anatomy baked into one fixed base** and customize only crown, garland, jewellery, drape, and scene. These layers offer the highest visual payoff with the lowest anatomical and cultural risk. Continue developing eyes/ears/trunk as an internal face-kit prototype until it passes all acceptance checks.

This fallback preserves the product promise that the chosen murti posture does not change while still delivering genuine, responsive customization.
