# Editor UI glass revamp plan

Date: 2026-08-12

## Decision

Revamp the existing portrait editor around three lightweight surfaces:

1. the artwork remains full-bleed and is always the visual focus;
2. one slim trailing rail changes accessory categories;
3. one low bottom shelf shows simple accessory thumbnails and the completion action.

Use plain, neutral system glass for navigation chrome. Do not imitate the reference image's metallic frames, gold lens flares, beveled panels, or glowing carousel. Use one warm saffron accent for selection and the primary action.

This is a UI-only change. Keep the current Customization Session, Asset Pack Runtime, renderer, persistence, export, and generation flow.

## Why this fits the current code

- `EditorScreen.swift` already separates the top bar, category dock, Variant tray, command bar, and canvas into view builders. The layout can be rearranged without changing editor behavior.
- `CustomizationViewState` already publishes the active Slot, playable Slots, visible Variants, selected Variant, thumbnails, completion state, and undo/redo state.
- The runtime manifest currently exposes four authored Slots: Crown, Garland, Outfit, and Modak. The rail must render `session.current.slots`, not hard-code the six categories shown in the concept.
- Every playable Variant already has a dedicated 256 x 256 transparent thumbnail and a loading test. The current artwork is already simple enough; the revamp only needs a quieter card treatment.
- The project compiles with Xcode 26.6 but still deploys to iOS 15. The baseline cannot depend exclusively on iOS 26 Liquid Glass APIs.

## Target screen anatomy

```text
+------------------------------------------------+
|  [Back]          Bappa Studio       [Undo][Redo]|
|                                                |
|                                                |
|             full-bleed live murti              |
|                                  +-----------+ |
|                                  | Crown     | |
|                                  | Garland   | |  plain glass rail
|                                  | Outfit    | |
|                                  | Modak     | |
|                                  +-----------+ |
|                                                |
|  +------------------------------------------+  |
|  | Select Crown              [Shuffle]  3/3 |  |
|  | [ thumbnail ][ thumbnail ][ thumbnail ]  |  |  quiet content shelf
|  +------------------------------------------+  |
|  [Saved]       [ Complete design ]    [Share]  |
+------------------------------------------------+
```

The trailing rail floats over the artwork instead of shrinking the canvas. If visual QA shows that it covers the murti's right hand, shift the showcase image approximately 12-16 points left in the regular layout only; do not change the exported composition.

For compact-height devices or accessibility Dynamic Type, keep the current vertical scrolling strategy and move categories into a horizontally scrollable row inside the shelf. This is a layout fallback, not a different interaction model.

## Visual rules

### Glass

- Glass belongs only to navigation and command surfaces: top utility buttons, category rail, the outer Variant shelf, and the two secondary bottom buttons.
- Variant cards are content, so they use a quiet warm-white fill rather than another layer of glass.
- Use one 1-point neutral highlight stroke and one soft shadow. Remove the existing warm gradient overlay from the tray.
- Do not use per-category colored glass, metallic gradients, inner glows, bevels, or gold reflections.
- When Reduce Transparency is enabled, use a nearly opaque warm-ivory surface.

Apple's current guidance reserves Liquid Glass for the navigation layer and warns against glass in content or glass stacked on glass. This layout follows that hierarchy: [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/).

### Colour and type

- Primary ink: deep warm brown, close to the current text colour.
- Accent: one saffron/amber colour for the selected border, check badge, and primary button.
- Glass tint: neutral; let the artwork provide the colour.
- Primary button: solid saffron or a nearly flat two-stop colour shift, not a metallic gradient.
- Continue using rounded system type for short labels. Keep labels in SwiftUI rather than baking them into thumbnails.

### Thumbnails

- Preserve the existing `thumbnailArtworkName` contract and transparent PNGs.
- Use `scaledToFit` with 8-10 points of breathing room on a plain card.
- Use one consistent card size. Start around 88 x 102 points, with a 68-72 point artwork area and a one- or two-line label.
- Show about 3.25 cards at current phone width so overflow is obvious.
- Selected state is a 2-point saffron outline plus a check badge; never depend on colour alone.
- Keep the SF Symbol fallback for a missing thumbnail, even though the runtime test should prevent it for playable content.

## Interaction rules

- Category tap only changes the focused Slot.
- Variant tap applies immediately, preserves the current haptic, and scrolls the selected card into view.
- Move Randomize into the Variant shelf header. This removes the current floating label and reduces overlap with the artwork.
- Keep presets/reset in a small overflow menu beside Randomize or the count.
- Keep Back, Undo, and Redo in the top bar.
- Keep Saved, Complete design, and Share in the bottom safe-area command bar.
- Use 44 x 44 point minimum hit targets. The visual icon can remain smaller inside the hit target.
- Keep existing Reduce Motion and Reduce Transparency behavior.

The current `ScrollViewReader` implementation is adequate and supports the iOS 15 deployment target. View-aligned scroll targeting is a useful newer API, but adopting it conditionally does not materially improve this small carousel and is not needed in the first slice.

## Platform glass strategy

Add one private `StudioGlassSurface` helper in `EditorScreen.swift`:

- On iOS 26, apply native `glassEffect` to the outer navigation surface or control.
- On iOS 15-25, use `regularMaterial` with the same shape, stroke, and shadow.
- Under Reduce Transparency, bypass both and use the opaque fallback.

Do not add custom shaders or blur pipelines. Do not wrap each thumbnail in its own Liquid Glass effect. If multiple separate glass controls later need morphing behavior, `GlassEffectContainer` is available, but it is unnecessary for the first implementation: [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views), [GlassEffectContainer](https://developer.apple.com/documentation/swiftui/glasseffectcontainer/).

## Implementation sequence

### Slice 1: Layout and hierarchy

Limit the change to `GanpatiStudio/EditorScreen.swift` and its existing layout tests.

1. Replace `categoryDock` with a trailing `accessoryRail` in the regular layout.
2. Retain a compact horizontal category dock only for compact-height and accessibility layouts.
3. Reduce `customizationTray` to its header and horizontal Variant list.
4. Move Randomize and the looks/reset menu into the tray header.
5. Remove the tray's warm gradient overlay and per-Slot shelf colours.
6. Change the completion button to a flat saffron treatment and retain the secondary glass buttons.

This slice should not touch `EditingSession.swift`, `AssetPackRuntime.swift`, the manifest, or any artwork file.

### Slice 2: Glass compatibility and accessibility

1. Add the single availability-aware glass helper.
2. Apply it only to the navigation surfaces identified above.
3. Verify Reduce Transparency, Reduce Motion, VoiceOver labels, disabled undo/redo contrast, and 44-point hit areas.
4. Extend the pure layout tests so three or more Variant cards remain visible and the compact fallback is chosen deterministically.

### Slice 3: Visual QA and small polish

1. Capture screenshots on iPhone 17e and iPhone 17 Pro Max.
2. Capture one accessibility Dynamic Type screenshot.
3. Check Crown, Garland, Outfit, and Modak, including the five-item Garland list.
4. Adjust only spacing, rail position, and artwork's on-screen offset.
5. Add at most a 140-180 ms selection fade/scale. No carousel arcs, particles, or glass morphing in this revamp.

## File-level impact

| File | Change |
|---|---|
| `GanpatiStudio/EditorScreen.swift` | Rearrange the category and Variant surfaces, centralize visual constants, add the glass fallback helper, and preserve existing actions. |
| `GanpatiStudioTests/EditorSessionTests.swift` | Extend layout-metric tests and compact-layout decision coverage. |
| `GanpatiStudio/EditingSession.swift` | No planned change. |
| `GanpatiStudio/AssetPackRuntime.swift` | No planned change. |
| `assets/runtime-packs/...` | No planned change; reuse current simple thumbnails. |

Keep the visual helpers private in `EditorScreen.swift` for the first slice. Splitting them into a design-system module would add project-file work before the visual direction has settled.

## Acceptance criteria

- The artwork is still the dominant surface and has more visible vertical space than the current build.
- Regular-height phones show the playable categories in a trailing rail; compact/accessibility layouts expose the same categories in a reachable horizontal fallback.
- No active control is smaller than 44 x 44 points.
- No metallic gradient, bevel, glow, or glass-on-glass thumbnail card remains.
- All playable thumbnails load through the current manifest-backed path.
- Crown, Garland, Outfit, and Modak selections, undo/redo, randomize, presets/reset, save, export, and Complete design behave exactly as before.
- Reduce Transparency produces an opaque, legible surface.
- The app builds for the iOS 15 deployment target and uses native iOS 26 glass only behind availability checks.
- Existing tests pass, and new layout tests cover the regular and compact arrangements.

## Explicitly deferred

- Seat and Background controls until their artwork is authored and the runtime manifest exposes them.
- New thumbnails or AI-generated UI assets.
- A radial or curved accessory carousel.
- Custom Metal, blur, refraction, or metallic shaders.
- A new editor state architecture.
- iPad-specific composition or landscape support.

This keeps the revamp visually meaningful while remaining a small, reversible change around the existing product core.
