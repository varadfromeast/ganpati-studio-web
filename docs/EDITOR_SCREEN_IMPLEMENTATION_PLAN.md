# Ganpati Studio editor screen implementation plan

Date: 2026-08-08

## Product direction

Build a portrait-first native iPhone editor that leans toward the joyful, tactile **Ganpati Play** reference while retaining the clearer editing hierarchy of **Ganesha Studio**.

Keep from the playful direction:

- warm cream canvas with teal, marigold, coral, pink, and purple accents;
- clay-like depth, soft shadows, rounded cards, and large illustrated choices;
- a large, immediate statue preview;
- obvious selected states and celebratory motion;
- friendly, low-reading-load controls.

Borrow from the refined direction:

- a compact editing-step header;
- explicit category navigation;
- randomize, undo, and save affordances;
- a persistent completion action;
- controlled accent colors and consistent ornament presentation.

Refine the language and content so the experience remains playful but respectful. Prefer **Choose a form**, **Adorn your Ganesha**, **Ornaments**, and **Complete design** over novelty framing. Defer sunglasses, parody forms, and other culturally sensitive novelty options until cultural review approves them.

## Screen anatomy

The first implementation is one vertically adaptive editor screen:

1. **Compact header**
   - Back, centered Ganpati Studio wordmark, undo/redo.
   - Optional progress copy: `Create · Adorn · Share`.
   - Use SF Symbols for standard actions and custom vector artwork only for the brand mark.

2. **Artwork stage**
   - Rounded-square live preview with a 1:1 internal coordinate system.
   - Calm base scene plus subtle petals/sparkle motion.
   - Randomize button overlays the lower trailing corner.
   - One accessibility element describes the complete visible design.

3. **Fixed Base Murti summary**
   - The Base Murti is chosen before entering the customization editor.
   - The editor shows the chosen form/posture as a compact locked summary; it cannot change while the Design is being customized.
   - Changing to another Base Murti is a separate flow because it replaces the complete compatible Asset Pack.

4. **Customization panel**
   - Heading: `Adorn your Ganesha`.
   - Customization Slots: Eyes, Ears, Trunk, Crown, Garland, Jewellery, Drape, Scene.
   - Slot tabs remain horizontally scrollable at 320-point widths.
   - Variants use one horizontally swipeable, page-snapping carousel with a label and optional one-line meaning.
   - Settling on a Variant updates the preview immediately and records one undo step.

5. **Persistent completion action**
   - `Complete design` sits above the safe area.
   - The app-level Home/Create/Gallery tab bar is deferred until those destinations are real. It should not consume editor space in the first slice.

On regular-height devices the hero occupies about 45–50% of the usable height. On an iPhone SE-class display the page scrolls, the hero becomes shorter, category controls remain reachable, and the completion action stays above the safe area. Export pixels never depend on screen dimensions.

## Visual system

- **Background:** warm ivory, with sparse decorative corner motifs rather than decoration behind controls.
- **Primary:** teal for current editing context and navigation.
- **Action:** marigold-to-orange treatment for the completion action.
- **Selection:** teal border plus filled check badge; never rely on color alone.
- **Cards:** 18–24 point radii, restrained soft shadows, 1-point warm highlight stroke.
- **Typography:** rounded display face only for short English headings; system fonts for controls and verified Devanagari fonts for Hindi/Marathi. Never rasterize UI labels into assets.
- **Motion:** 140–220 ms selection transitions, light haptic feedback, gentle hero cross-fades, and restrained decorative particles. Reduce Motion changes transforms to fades.
- **Touch:** interactive targets aim for 44×44 points, with spacing that prevents adjacent category mistakes.

## Deep modules and seams

### 1. Editor module

The editor module owns all in-process behavior behind a small interface:

```swift
protocol EditingSession {
    var current: EditorViewState { get }
    mutating func perform(_ intent: EditorIntent) -> EditorOutcome
}
```

Its implementation hides catalog defaults, form/slot compatibility, selection repair, undo/redo history, reset, deterministic randomization, accessible summary creation, and the render specification. SwiftUI receives only immutable view state and sends user intent.

Invariants:

- every published selection is complete and compatible;
- one accepted visible mutation creates one undo entry;
- randomization is deterministic for a supplied seed and never produces an invalid design;
- the published artwork specification and visible choice state describe the same revision.

### 2. Artwork-renderer module

```swift
protocol ArtworkRendering {
    func render(
        _ specification: ArtworkSpecification,
        target: ArtworkTarget
    ) async throws -> RenderedArtwork
}
```

The implementation hides image decoding, anchors, z-order, masks, Core Image effects, Core Graphics/Core Text export, color space, memory cleanup, and PNG/JPEG encoding. The live SwiftUI Canvas preview and deterministic export adapter consume the same normalized specification.

### 3. Asset-pack compiler module

This is a development/build-time module, not runtime UI infrastructure:

```swift
protocol AssetPackCompiling {
    func validate(_ source: AssetPackSource) -> ValidationReport
    func compile(_ source: AssetPackSource) throws -> CompiledAssetPack
}
```

It hides trimming, coordinate conversion, thumbnail generation, manifest generation, asset-name normalization, and validation. It rejects missing slots, duplicate IDs, invalid anchors, unsupported color profiles, inconsistent dimensions, and impossible default combinations before assets enter the app.

Do not add repositories or provider interfaces around the bundled catalog yet; there is only one runtime adapter, so those would be hypothetical seams.

## Asset production contract

### Artist master

- One canonical **2048×2048 px** sRGB canvas per form/pose.
- Every replaceable item lives in a named layer/group positioned on that canvas.
- Keep body occlusion pieces separate where an ornament passes both behind and in front of the statue.
- Maintain one camera, face geometry, limb placement, light direction, shadow softness, and ground plane for the complete pack.
- Keep text, selection badges, labels, and UI shadows out of artwork layers.
- Save an editable layered master such as PSD, Affinity, or Procreate plus exported files.

### Exported runtime assets

- Transparent raster artwork: de-interlaced PNG with embedded sRGB profile.
- Opaque photographic/background art: optimized JPEG or HEIC after visual comparison.
- Flat interface icons and motifs: SVG or PDF; standard actions use SF Symbols.
- Preview layer budget: sized for the actual preview, not the 2048 master.
- Export layer: high-resolution trimmed image loaded only during final composition.
- Thumbnail: dedicated square crop; do not decode the export image merely to display a choice card.
- Retain the full-canvas master for alignment, but compile runtime images to their tight nontransparent bounds and store normalized anchor/rect metadata.

Recommended naming:

```text
classic.crown.ruby_01.preview
classic.crown.ruby_01.export
classic.crown.ruby_01.thumbnail
classic.crown.ruby_01.front_mask
classic.crown.ruby_01.back_mask
```

Manifest fields:

```text
asset_id
pack_id
pose_id
slot
preview_asset
export_asset
thumbnail_asset
normalized_rect
anchor
z_index
blend_mode
front_mask
back_mask
compatible_asset_ids
prompt_tokens
meaning_title
meaning_description
accessibility_label
```

Use Xcode asset catalogs so App Store thinning and platform asset optimization remain available. Large artwork must be optimized for its display dimensions because decoded pixel dimensions—not compressed file size—drive memory use.

## Interaction specification

- **Form tap:** switch atomically to the form's valid default/last design; cross-fade the stage.
- **Category tap:** update the option carousel without changing the artwork.
- **Option tap:** apply one compatible selection, animate only affected layers, announce the change to VoiceOver, and enable Undo.
- **Randomize:** choose a complete compatible design as one undoable action.
- **Undo/redo:** restore the full visible design revision, including form and active category where appropriate.
- **Complete design:** freeze the current revision and move to the generation/share flow. Later changes cannot alter an in-flight job's image/metadata pair.
- **Missing/corrupt asset:** preserve the prior valid selection, show a recoverable message, and log the manifest error.

## TDD vertical slices

Tests are written one slice at a time, red before green, through the confirmed seams:

1. Editor module publishes a complete default form.
2. Selecting one crown changes the immutable artwork specification.
3. Live SwiftUI screen renders the default state on compact and regular devices.
4. Canvas preview draws specification layers in stable z-order.
5. Undo and redo restore the exact observable design.
6. Category and option controls remain reachable at 320-point width and largest Dynamic Type.
7. Seeded randomize produces a compatible design as one history action.
8. Artwork renderer exports a known 1024×1024 golden result from the same specification.
9. Complete design freezes one revision for the next flow.

Tests do not inspect history arrays, compatibility helpers, PRNG state, Core Graphics calls, image caches, or manifest parser internals.

## Implementation sequence

### Phase 0 — toolchain and project

- Install/select Xcode 26.6 and the current iOS Simulator runtime.
- Create an iPhone SwiftUI app with iOS 15 deployment target and Swift 6 language mode.
- Add the editor, renderer, and UI test targets.
- Establish screenshot devices: compact iPhone and current Pro Max.

### Phase 1 — static visual shell

- Implement responsive header, artwork stage, form cards, category row, option cards, and completion action using temporary local assets.
- Establish color, typography, radii, shadows, safe-area behavior, Dynamic Type, and accessibility labels.
- Capture simulator screenshots at both device extremes and compare against the reference direction.

### Phase 2 — editor tracer bullet

- Implement the minimal Editor module interface.
- Connect one Classic pose, two crowns, two garlands, two drapes, and two scenes.
- Complete selection, undo/redo, reset, and deterministic randomize through red→green cycles.

### Phase 3 — asset pipeline and live composition

- Define the manifest and asset-pack folder template.
- Build validation/compilation for anchors, trimming, masks, thumbnails, and runtime names.
- Replace temporary stage images with Canvas composition from normalized metadata.
- Add bounded decoding/cache behavior and memory-warning cleanup.

### Phase 4 — polish

- Add haptics, transition choreography, respectful microcopy, meaning text, decorative particles, Reduce Motion, VoiceOver, and increased-contrast behavior.
- Profile animation frame rate and decoded image memory on the oldest available physical device.

### Phase 5 — deterministic export handoff

- Render square and story outputs through the artwork-renderer seam.
- Verify Devanagari shaping, color consistency, stable pixels, cancellation, and low-memory recovery.
- Freeze a design revision for the later AI-generation job flow.

## Acceptance criteria for this screen

- A first-time user can change form/category/ornament without instruction.
- Every tap updates the preview perceptibly within one frame after asset availability.
- No reachable combination is visually incompatible.
- The screen remains usable at 320-point width and largest accessibility text size.
- Decorative motion honors Reduce Motion.
- The oldest supported test device remains responsive during rapid option changes and repeated randomization.
- Exported output matches the selected preview specification and is independent of device screen dimensions.
- Cultural review approves every form, title, object, and meaning description before production release.

## Sources

- [Apple: Managing assets with asset catalogs](https://developer.apple.com/documentation/xcode/managing-assets-with-asset-catalogs)
- [Apple: Optimizing app size with asset catalogs](https://developer.apple.com/documentation/xcode/doing-basic-optimization-to-reduce-your-app-s-size)
- [Apple: Image formats, scale factors, and color profiles](https://developer.apple.com/design/human-interface-guidelines/images)
- [Apple: Reducing image memory use](https://developer.apple.com/documentation/xcode/making-changes-to-reduce-memory-use)
- [Apple: Accessibility and control sizing](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple: SF Symbols and custom symbol assets](https://developer.apple.com/documentation/uikit/configuring-and-displaying-symbol-images-in-your-ui)
