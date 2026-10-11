# Character customization as the product moat

Status: first-principles product and architecture recommendation
Research date: 2026-08-08
Scope: modern character-customization systems and their application to the fixed-pose, cute Bal Ganpati editor. This complements `ASSET_PIPELINE_RESEARCH.md`; it does not replace that document's detailed layer-export specification.

## Executive conclusion

High-quality customization is not a large catalog. It is a **trusted composition system** in which every choice preserves the character's identity, fits without seams, gives immediate and reversible feedback, and survives the handoff to a share image or generated output.

The strongest systems separate the durable identity from what can change. Roblox explicitly divides an avatar into body geometry, rigging, animation, and attachment/cage structures, then layers cosmetics and clothing over that identity. MetaHuman stores a character's face/body state separately from a slot-based wardrobe and commits interactive changes into a live viewport. Memoji similarly begins with a persistent personal character and varies named feature categories, while Bitmoji can carry the same visual identity into 2D stickers, a rigged 3D model, or a reactive head. ([Roblox avatar system](https://create.roblox.com/docs/avatar), [MetaHuman scripting model](https://dev.epicgames.com/documentation/metahuman/metahuman-creator-python-scripting-in-unreal-engine), [Apple Memoji](https://support.apple.com/en-euro/111115), [Snap Bitmoji](https://developers.snap.com/lens-studio/features/bitmoji-avatar/overview))

For this app, that means:

1. Keep one approved Bal Ganpati posture, face, proportions, mudras, and expression as the **identity kernel**.
2. Build a 2D equivalent of attachment sockets and clothing cages: canonical anchors, fit masks, back/front layer pairs, fixed hair/hand occluders, compatibility rules, and automated validation.
3. Let people make a few visually meaningful choices—initially Crown, Garland, Outfit/Drape, Modak, Seat, and Scene—rather than exposing fragile anatomical sliders.
4. Keep the tray visible, apply every tap instantly, and make exploration consequence-free through undo, reset, curated presets, and a compatibility-aware “Surprise me.”
5. Save a versioned **customization recipe**, not only a screenshot. Send both the deterministic flattened composition and that recipe to image/video generation. The model improves finish and atmosphere; it must not reinterpret the chosen identity.

The defensible asset is therefore the combination of the fit grammar, reviewed component catalog, compatibility/quality data, and an accumulating record of which combinations people choose and consider faithful—not the generation API itself.

## What representative systems teach

| System | First-party evidence | Transferable principle |
| --- | --- | --- |
| Roblox avatars and layered clothing | Roblox defines attachment points for rigid accessories and inner/outer cages for clothing that must stretch and layer across bodies. It supplies reference rigs/mannequins, fitting tools, technical specifications, and validation rather than relying on arbitrary per-item placement. ([avatar architecture](https://create.roblox.com/docs/avatar), [layered clothing](https://create.roblox.com/docs/art/accessories/layered-clothing), [clothing specifications](https://create.roblox.com/docs/art/accessories/clothing-specifications)) | **Fit is a contract.** An item is catalog-ready only if it conforms to shared geometry/anchor semantics and passes combination testing. |
| Unreal modular characters | Unreal supports swappable character meshes, but documents explicit tradeoffs between a quick multi-component setup, more capable pose copying, and runtime mesh merging. Separate components also create additional render work/draw calls. ([Unreal modular characters](https://dev.epicgames.com/documentation/unreal-engine/working-with-modular-characters-in-unreal-engine)) | **Modularity has a runtime cost.** Preserve modular authoring and deterministic recipes, but flatten/cache the visible 2D result when repeated compositing no longer buys interaction value. |
| MetaHuman | A MetaHuman asset stores face, body, eyes, makeup, viewport, and slot-based wardrobe state. Interactive edits are committed so the viewport refreshes and the asset remains serialized. Assembly then creates cinematic or optimized outputs; Epic reports a large memory gap between those targets. ([character state and wardrobe slots](https://dev.epicgames.com/documentation/metahuman/metahuman-creator-python-scripting-in-unreal-engine), [assembly and optimization](https://dev.epicgames.com/documentation/metahuman/assembly)) | **One recipe, multiple representations.** The editing state is canonical; preview, export, thumbnail, and high-quality generation are derived assemblies with different budgets. |
| The Sims Create-a-Sim | EA presents customization as control over appearance, fashion, movement, voice, traits, and aspirations—not merely interchangeable cosmetics. Its player guide supports direct manipulation, tutorials, randomization, and genetics. Its official creator criteria require editable sources, stable naming, predictable in-game behavior, stacking tests, multiple variants, in-game review images, and preservation of key silhouette at lower detail. ([Create Your Sims](https://thesims-api.ea.com/game-info/smarter-sims), [official player guide](https://cdn-assets-ts4.pulse.ea.com/Guide/TheSims4_Players_Guide.pdf), [CAS technical criteria](https://media.contentapi.ea.com/content/dam/eacom/SIMS/common/create-a-sim-technical-test-criteria.pdf)) | **Choice needs meaning and production discipline.** Offer recognizably different looks, give beginners a starting point, and treat source files, naming, preview parity, stacking, and silhouette as release criteria. |
| Apple Memoji | Apple organizes creation into understandable feature categories such as skin tone, hairstyle, and eyes; the resulting Memoji becomes a reusable sticker pack and can animate with the person's expressions. ([Apple Memoji](https://support.apple.com/en-euro/111115)) | **A character should remain recognizable across outputs.** Category changes enrich an identity rather than replacing it, and finished characters should become reusable artifacts. |
| Snap Bitmoji | Snap describes Bitmoji as a pipeline from one personal avatar to 2D, rigged 3D, or a reactive head, and exposes explicit prop attachments. Its integration rules emphasize visual identity, quality, respectful use, and restrictions on modification. ([Bitmoji overview](https://developers.snap.com/lens-studio/features/bitmoji-avatar/overview), [Bitmoji use rules](https://developers.snap.com/snap-kit/app-review/bitmoji-use)) | **Portability compounds attachment.** A saved Ganpati should later power a still, greeting, sticker, subtle animation, and festival recap without losing the approved design. |

## First-principles model

### 1. Preserve an identity kernel

A customization system succeeds when the result is different **and still unmistakably the same character**. For the first posture, lock the face shape, eye spacing, trunk path, ear silhouette, belly/body proportions, limb count, mudras, held-object semantics, camera, and light direction. Blinking is expression state, not an identity change.

This makes the current approved cute Bal Ganpati the canonical character—not merely a background image. Crown, garland, cloth, offering, seat, and scene may change around it. Independent eyes/ears/trunk should wait until the team can author and approve compatible **face kits**; unrestricted anatomy swapping would maximize combinations while weakening identity and religious fidelity.

### 2. Replace pixel offsets with a fit and occlusion grammar

Roblox's key lesson is not “use 3D cages”; it is that arbitrary placement does not scale. Our 2D equivalents are:

- canonical master coordinates for each posture;
- named sockets such as `headwear`, `neck`, `lapOffering`, and `seat`;
- a fit mask and safe bounds for each socket;
- paired back/front layers when an item wraps the body;
- fixed foreground occluders such as front curls, hands, fingers, and trunk segments;
- `requires`, `excludes`, and `occludedBy` relationships;
- a preview/reference composite that demonstrates the approved fit.

The current crown problem is an occlusion problem, not a scale problem. A snug crown needs a back section behind the hair, a band conforming to the head contour, and front curls painted above the band. A single detached crown PNG can only float over the head. Full-image crown variants are acceptable for visual approval, but the production asset should be decomposed into `crownBack + crownFront + fixedHairFront` so the same exact fit is deterministic.

### 3. Optimize for meaningful, legible choices

At phone size, silhouette, color block, material, and story read before fine ornament. EA's CAS criteria explicitly require lower-detail assets to preserve the key silhouette and reserve added complexity for visible quality. ([EA CAS technical criteria](https://media.contentapi.ea.com/content/dam/eacom/SIMS/common/create-a-sim-technical-test-criteria.pdf))

Each option in a category should therefore have a one-sentence visual promise and be distinguishable in grayscale silhouette:

- Crown: compact royal mukut / tall peacock mukut / soft floral headpiece.
- Garland: short temple mala / long marigold mala / lotus-and-jasmine mala.
- Outfit: saffron traditional / peacock teal / festive rose.
- Seat: embroidered gaddi / lotus pedestal / carved chowki.
- Scene: nursery shrine / home mandap / festive courtyard.

Five near-identical gold crowns produce catalog volume, not perceived agency. Three authored archetypes produce stronger choice and cleaner thumbnails.

### 4. Make experimentation immediate and consequence-free

The editor is a playground, so the loop must be `see → tap → compare → keep or undo`, with no generation/network wait in the preview path. The Sims pairs detailed control with randomization and starting mechanisms; MetaHuman separates live preview edits from later assembly. ([The Sims official play guide](https://www.ea.com/games/the-sims/the-sims-4/how-to-play-the-sims), [MetaHuman scripting model](https://dev.epicgames.com/documentation/metahuman/metahuman-creator-python-scripting-in-unreal-engine))

For this app:

- Keep the basic tray always visible; body-part touch may switch the active category, but must never be the only way to reveal it.
- Apply a selection locally within one frame and show selection with shape/checkmark plus label, not glow or color alone.
- Maintain an action history by recipe delta, enabling Undo/Redo and Reset without re-rendering from scratch.
- Provide 3–5 culturally reviewed presets as good starting points.
- Add “Surprise me” only after compatibility metadata exists. Randomize within coherent palettes/collections; never sample the raw Cartesian product.
- Preserve context when changing categories. Apple recommends consistent control positions and simple gestures, with onscreen alternatives for gesture-driven actions. ([Apple design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles), [Apple accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/))

### 5. Treat every component as shipped software

Roblox and EA both provide templates, strict naming/configuration, import validation, and in-context testing; EA additionally requires editable layered sources and proof that the game-ready asset renders correctly. ([Roblox Avatar Setup](https://create.roblox.com/docs/avatar-setup), [EA CAS technical criteria](https://media.contentapi.ea.com/content/dam/eacom/SIMS/common/create-a-sim-technical-test-criteria.pdf))

An option is not “done” when its PNG exists. It is done when it has source provenance, stable IDs, declared compatibility, preview parity, edge/alpha QA, cultural approval, rights clearance, and screenshots at target phone size. This content compiler and validation suite is a core product capability.

### 6. Cultural safety is part of quality, not moderation after launch

Customization of a deity is not the same as customization of a fictional game avatar. Define invariants with a small advisory group that includes a practicing family/community perspective and an iconography expert or artist. Review names, mudras, objects, ornaments, posture, text, and generated outputs. Record approvals by asset version.

This should be generative restraint, not generic “safety”: prevent extra limbs, altered mudras, disrespectful costumes, weapon substitutions, sexualization, caricature, and incompatible sacred symbols. Apple advises teams to examine imagery through cultural and religious perspectives; its review rules also reject inflammatory religious commentary and misleading religious quotations. ([Apple inclusion guidance](https://developer.apple.com/design/human-interface-guidelines/inclusion), [App Review Guidelines 1.1](https://developer.apple.com/app-store/review/guidelines/))

EA's representation work is also instructive: it describes inclusion as ongoing collaboration with people who contribute lived experience and cultural expertise, rather than a one-time content drop. ([The Sims: who we are](https://www.ea.com/games/the-sims/who-we-are))

### 7. Ship a small instant core; stream breadth later

Bundle the approved base, default options, thumbnails, manifest, and one complete preset so first customization is offline and immediate. Prefetch the rest of the current category; load high-resolution share assets only when saving/generating. Cache the active recipe and recent assets, and degrade to preview-resolution assets under memory pressure.

Apple's Background Assets framework supports essential-before-launch, prefetched, and on-demand asset packs and can update hosted content without a new binary. Apple now recommends it over the deprecated On-Demand Resources path on newer platforms. ([Background Assets framework](https://developer.apple.com/documentation/backgroundassets/), [App Store Connect background assets](https://developer.apple.com/documentation/appstoreconnectapi/background-assets), [ODR deprecation notice](https://developer.apple.com/help/app-store-connect/reference/app-uploads/on-demand-resources-size-limits))

Do not import MetaHuman's complexity into a 2D app, but adopt its output-tier idea: a lightweight responsive preview assembly and a separate high-quality flattened export. Epic's own cinematic-versus-optimized assembly shows why one representation should not serve every performance budget. ([MetaHuman assembly](https://dev.epicgames.com/documentation/metahuman/assembly))

### 8. Persist intent, then derive outputs

The durable user artifact should be a versioned recipe:

```json
{
  "schemaVersion": 1,
  "postureID": "murti.bal-seated.v1",
  "baseVersion": "1.0.0",
  "selections": {
    "crown": "crown.peacock.v1",
    "garland": "garland.jasmine-lotus.v1",
    "outfit": "outfit.saffron.v1",
    "modak": "modak.classic.v1",
    "seat": "seat.gaddi-teal.v1",
    "scene": "scene.home-mandap.v1"
  },
  "presetID": null
}
```

From that recipe the app can rebuild the live preview, render a flattened share image, migrate old saved designs, describe accessibility state, and construct an image/video generation request. The generation handoff must include both the flattened deterministic composite and structured IDs/labels with invariants. A generated still or video is a derivative output; it never becomes the source of truth for the editable design.

## Recommended content contract

Each catalog item should declare at least:

| Field | Purpose |
| --- | --- |
| `assetID`, `version`, `slot` | Stable recipe and migration identity. |
| `compatiblePostures` | Prevent an item from appearing on a base it was not fitted to. |
| `layers[]` with file, canonical frame, z-order | Deterministic composition without device-specific offsets. |
| `socketID`, `fitMask`, `occludedBy[]` | Explicit snug-fit and wrap behavior. |
| `requires[]`, `excludes[]`, `collectionTags[]` | Compatibility-aware presets and randomization. |
| `silhouetteClass`, `paletteTags`, localized `displayName` | Search, curation, meaningful variety, and accessible description. |
| `thumbnail`, `referenceComposite`, `contentHash` | Picker parity, review evidence, and integrity. |
| `source`, `rights`, `aiAssisted` | Editable provenance and licensing audit. |
| `technicalReview`, `culturalReview` | Independent gates with reviewer, date, and status. |

Validation should fail the build/catalog ingest for missing alpha, out-of-canvas frames, undeclared z-order ties, missing files/hashes, incompatible IDs, absent rights, or unapproved cultural status. Visual regression tests should render every single item and pairwise high-risk overlaps; a smaller curated matrix should test complete looks at actual device dimensions.

## Product architecture

Keep the domain deeper than the SwiftUI views:

```text
CustomizationCatalog
  owns slots, options, compatibility, presets, migrations
        |
CustomizationSession
  owns current recipe, apply/undo/redo/reset/randomize
        |
CompositionEngine
  resolves layers + occlusion and renders preview/export
        |
GenerationHandoff
  packages flattened image + recipe + cultural invariants
```

The view asks the session for available options and applies an `assetID`; it never calculates pixel placement. The renderer consumes a resolved composition; it never decides whether two sacred/visual choices are compatible. The generation layer receives an immutable snapshot; it never reads transient UI state. These seams let the catalog and quality system grow without turning `EditorScreen` into the product's rules engine.

## Phased roadmap

### Phase 0 — prove fit and delight now

- Approve one base and three genuinely snug crown compositions.
- Keep the full-screen Murti and always-visible bottom tray.
- Implement instant selection, blink with Reduce Motion support, Undo, and Reset.
- Use full compositions temporarily if necessary for review, but record the target back/front/occluder decomposition.

**Gate:** all three crowns look worn—not pasted—on the smallest supported iPhone and survive a side-by-side review with the source inspiration.

### Phase 1 — establish the customization kernel

- Implement `CustomizationCatalog`, `CustomizationSession`, versioned recipe, and deterministic `CompositionEngine`.
- Convert crowns to the socket/occlusion contract.
- Add three options each for Garland, Outfit, Modak, Seat, and Scene.
- Add automated ingest checks and golden composite tests.

**Gate:** every supported combination renders offline, restores after relaunch, undoes correctly, and has technical/cultural approval.

### Phase 2 — make discovery and return usage strong

- Add curated festival presets and compatibility-aware “Surprise me.”
- Save named designs and show recent creations.
- Add pack delivery/caching and a seasonal catalog cadence.
- Add accessibility labels, Dynamic Type-safe tray behavior, non-color selection state, and Reduce Transparency fallback.

**Gate:** first meaningful change is fast, users can recover any prior design, and no pack download blocks the default experience.

### Phase 3 — turn recipes into premium outputs

- Export deterministic high-resolution stills locally.
- Send flattened composite + recipe + invariants to image generation.
- Add a fidelity review/retry loop and preserve the exact recipe beside every output.
- Add short video only after still fidelity is consistently high; motion should enhance lamps, petals, camera, and expression without changing anatomy or choices.

**Gate:** crown, face, trunk, hands, held objects, garment palette, and seat remain faithful in a blinded output review.

### Phase 4 — deepen the moat carefully

- Expand seasonal/regional packs through the same contract and advisory review.
- Experiment with approved face kits, never unconstrained anatomical mixing.
- Reuse the saved identity across greeting cards, stickers, family collections, and yearly festival recaps.
- Use preference evidence to commission better archetypes and combinations, not merely more inventory.

## Telemetry and defensibility

Measure the quality of the creative loop, not vanity tap counts:

- time to first applied change;
- category opened → option previewed → option retained;
- undo/reset rate per asset and per incompatibility class;
- preset chosen → modified versus accepted unchanged;
- “Surprise me” accepted versus immediately undone;
- save, revisit, share, generate, retry, and fidelity-rating conversion;
- pack download latency/failure and missing-asset fallback;
- render time, memory warnings, and output-generation latency;
- culturally sensitive output reports and time to resolution.

Use aggregated, privacy-minimized events and avoid collecting raw generated images or inferring religious identity unless the feature truly requires it and the user understands the purpose. Apple notes that its own retention analytics depends on opted-in usage data and privacy thresholds; that is a useful standard of restraint even if product analytics uses another implementation. ([Apple App Retention](https://developer.apple.com/help/app-store-connect-analytics/engagement/app-retention))

The compounding moat is:

1. **Fit corpus:** approved socket masks, occlusion recipes, and regression renders for every posture/slot.
2. **Cultural trust corpus:** documented invariants, reviewers, terminology, and approved combinations.
3. **Taste graph:** which silhouettes, palettes, presets, and sequences are retained together—not personally sensitive identity labels.
4. **Generation fidelity set:** flattened input, structured recipe, output, and human fidelity assessment for improving prompts/evals.
5. **Content operating system:** creator templates, automated validation, provenance, versioning, pack delivery, and migrations.

Competitors can call the same image model. They cannot quickly reproduce a catalog where hundreds of combinations fit cleanly, feel coherent, respect iconography, restore perfectly, and generate faithful premium outputs.

## Anti-patterns

- **Detached sticker positioning:** tuning `x/y/scale` until one crown appears acceptable. It will not create temple wrap or hair occlusion.
- **Combinatorial theater:** advertising thousands of combinations when most differ only in fine detail or contain collisions.
- **Prompt-as-state:** saving prose instead of stable asset IDs and a deterministic composite.
- **AI as runtime asset authority:** accepting generated layers without repainting, fit validation, provenance, and cultural review.
- **Anatomy first:** swapping eyes, ears, and trunk independently before decorative sockets are proven.
- **Hidden customization:** requiring press-and-hold or body-part discovery to reveal the only selector.
- **Irreversible surprise:** randomizing all categories without a single-step undo or compatibility rules.
- **Thumbnail dishonesty:** a picker image that does not match the applied asset.
- **Color-only selection:** glow/tint without label, outline, or checkmark.
- **Network-bound play:** making every tap wait for generation or download.
- **One giant shipped catalog:** increasing install size and QA surface before preference evidence exists.
- **Generated-output drift:** treating a beautiful result as successful when it changed the chosen crown, face, trunk, limbs, mudras, or objects.
