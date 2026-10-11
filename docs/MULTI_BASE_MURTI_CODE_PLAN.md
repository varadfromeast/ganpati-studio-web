# Multiple Base Murtis: deep-module code plan

Status: proposed

## Outcome

Add a second cute Bal Ganesh Base Murti with a different posture without teaching
the editor, exporter, saved-design library, or generation flow about individual
postures or pack folders.

The intended extension rule is:

> Adding a bundled Base Murti requires one validated Asset Pack and one library
> registration entry. It must not require posture-specific branches in product
> code.

The art remains posture-specific. Each Base Murti owns its fitted Variants,
sockets, masks, occluders, defaults, reviews, and golden renders. The code reuses
the same modules.

## Current architecture: what is already sound

- `MurtiRecipe` already persists `postureID`, `baseVersion`, and selected Variant
  IDs. A recipe therefore has enough identity to route to the correct Base Murti.
- `CompiledAssetPack` rejects a recipe whose Base Murti or selected Variants do
  not belong to the pack.
- `CustomizationSession` is already a deep module. Its small interface is
  `current` plus `perform(_:)`; it hides recipe history, presets, compatibility,
  and view-state projection.
- `AssetPackCompiler` and `NativeAssetCompositionRenderer` already concentrate
  manifest validation and deterministic pixel composition.
- Technical and cultural review gates belong to authored content rather than the
  view layer.

These modules should be preserved and deepened, not bypassed.

## Current pressure points

The second Base Murti would currently spread knowledge across callers:

1. `CustomizationCatalog.cuteBal` contains a large Swift-authored planned catalog
   and opens `bal-seated-crowns-v2` itself.
2. `AssetPackRuntime.editingCatalog(extending:)` joins manifest facts to the
   Swift catalog. A second pack would require another parallel catalog and
   another merge path.
3. `CompositionEngine` embeds the pack folder string in
   `ResolvedComposition`.
4. `CuteMurtiCanvas` and `HighResolutionStillExporter` reopen the runtime from
   that folder string independently.
5. `EditorScreen` constructs persistence, the session, and the saved-design
   library with `.cuteBal`.
6. `StillGenerationSheet` also constructs its model with `.cuteBal`, even though
   it receives a recipe that may eventually belong to another Base Murti.
7. `RecipePersistence`, `RecipeMigrationRegistry`, and `SavedDesignLibrary`
   validate against one catalog. A valid design for another Base Murti would be
   treated as incompatible or dropped.
8. The canvas uses a hard-coded `941 × 1672` display size instead of the active
   Base Murti's canvas.

The deletion test exposes the missing module: if the hard-coded `.cuteBal` and
pack-folder knowledge were deleted, it would reappear in the editor, exporter,
generation sheet, persistence, and tests. That complexity should live in one
place.

## Proposed module map

```text
GanpatiStudioApp / SwiftUI
        |
        v
StudioSession
  active Base Murti, per-murti drafts, switching, editor intents
        |
        v
BaseMurtiLibrary
  lists and resolves installed Base Murtis by ID or recipe
        |
        v
MurtiPack
  complete authored catalog + recipe validation + composition + render
        |
        +--> AssetPackCompiler
        +--> NativeAssetCompositionRenderer
        +--> private pack-file adapter

Side modules:
  SavedDesignLibrary -- validates/migrates recipes through BaseMurtiLibrary
  GenerationHandoff  -- receives the resolved MurtiPack, never a global catalog
  AssetPackLifecycle -- supplies installed pack locations; does not choose UI state
```

There are three important external seams: `MurtiPack`, `BaseMurtiLibrary`, and
`StudioSession`. File loaders, manifest decoders, and image loaders remain
internal seams.

## Module 1: `MurtiPack`

### Responsibility

Represent one fully loaded Base Murti. It owns every fact needed to customize,
validate, render, export, and describe designs for that Base Murti.

It should absorb the responsibilities currently split between
`CustomizationCatalog`, `AssetPackRuntime`, `CompositionEngine`, pack-folder
lookup in the canvas/exporter, and catalog lookup in `GenerationHandoff`.

### Proposed interface

```swift
struct BaseMurtiSummary: Identifiable, Equatable, Sendable {
    let id: String
    let baseVersion: String
    let displayName: String
    let thumbnailName: String
    let canvas: PixelSize
    let releaseEligible: Bool
}

struct MurtiPack: Sendable {
    let summary: BaseMurtiSummary

    func makeSession(
        restoring recipe: MurtiRecipe?,
        reviewMode: ContentReviewMode
    ) -> CustomizationSession

    func validate(_ recipe: MurtiRecipe) -> Bool

    func render(
        _ recipe: MurtiRecipe,
        scale: Int
    ) throws -> LocalStillExport

    func prepareGeneration(
        recipe: MurtiRecipe,
        flattenedPNG: Data,
        output: GenerationOutputKind
    ) throws -> GenerationEnvelope
}
```

This is intentionally four behaviours rather than exposing the catalog,
compiled composition, image loader, folder resource, or prompt-building pieces.
The implementation can keep those as internal values.

If `validate(_:)` is only needed internally after migration, remove it from the
external interface and route validation through `makeSession`, `render`, or
`prepareGeneration`. Fewer methods are better when callers do not need them.

### Invariants

- A `MurtiPack` represents exactly one `postureID` and one active `baseVersion`.
- Its default recipe always validates.
- Every playable slot has one valid default Variant.
- Every selectable Variant is fitted to this pack's Base Murti.
- `render` rejects a recipe from any other Base Murti before reading images.
- `render` is deterministic for `(recipe, pack version, scale)`.
- The caller never supplies or learns a filesystem or bundle path.
- Release mode cannot open a pack with incomplete technical, cultural, or rights
  review.

### Content source of truth

`editingCatalog(extending:)` should be retired. It makes the caller understand
that some facts are in Swift and others are in the manifest.

The pack manifest should contain the complete playable editor catalog:

- Base Murti display name, picker thumbnail, accessibility description;
- slot order;
- Variant display name, meaning, picker thumbnail, collection/style tags;
- defaults and presets;
- geometry, layer bindings, compatibility, rights, and reviews.

This can be introduced as manifest schema v3, with the existing v2 compiler kept
as a legacy adapter during migration. Do not add a public "planned catalog"
parameter to `MurtiPack`; that would preserve the shallow merge.

`systemImageName` is application chrome rather than authored art. Keep its
default mapping on `CustomizationSlot`; add a manifest override only if a real
second use case appears.

### Variant identity

Posture-specific pixels need posture-specific IDs:

```text
crown.royal.bal-seated.v1
crown.royal.bal-lalitasana.v1
```

To associate them as the same visual concept, add a stable `designFamilyID`:

```text
designFamilyID: crown.royal
```

Do not reuse one Variant ID for different image bytes. `designFamilyID` can later
power “keep this look when changing Base Murti,” analytics, and catalog
merchandising without weakening recipe identity.

## Module 2: `BaseMurtiLibrary`

### Responsibility

Own discovery and resolution across all installed Base Murtis. Callers ask for a
Base Murti; they do not know whether it is bundled, cached, or downloaded.

### Proposed interface

```swift
struct BaseMurtiLibrary: Sendable {
    var available: [BaseMurtiSummary] { get }

    func open(id: String) throws -> MurtiPack
    func resolve(recipe: MurtiRecipe) throws -> MurtiPack
    func restore(recipe: MurtiRecipe) throws -> RecipeMigrationOutcome
}
```

`open(id:)` supports the Base Murti picker. `resolve(recipe:)` supports saved
designs, exports, and generated-design history. `restore(recipe:)` hides the
correct posture-specific migration registry.

If migration can be performed as part of `resolve(recipe:)`, prefer returning a
single `ResolvedRecipe` containing the pack, normalized recipe, and report. That
would deepen the module further:

```swift
struct ResolvedRecipe: Sendable {
    let pack: MurtiPack
    let recipe: MurtiRecipe
    let migration: RecipeMigrationReport
}

func resolve(_ recipe: MurtiRecipe) throws -> ResolvedRecipe
```

That alternative is preferred because every caller needs the same sequence:
identify pack, migrate recipe, validate result.

### Adapters

There are already two real pack-location behaviours:

- bundled packs for production/default content;
- directory packs used by tests and downloaded content.

Therefore a pack-source seam is justified, but it should remain internal to the
library implementation. Production uses bundle/cache adapters; tests use a
temporary-directory adapter. SwiftUI must not receive that adapter.

### Invariants

- Base Murti IDs are unique across installed packs.
- At most one installed version is active for an ID.
- A recipe is routed by `postureID`, never by Variant IDs or folder naming.
- An unavailable pack produces a typed `contentUnavailable` result; it never
  causes a saved design to be deleted.
- Library ordering is stable and authored, not filesystem-dependent.
- The bundled default is always resolvable.

### Relationship to `AssetPackLifecycle`

Keep delivery and product selection separate:

- `AssetPackLifecycle` decides which bytes are installed and supplies validated
  local locations.
- `BaseMurtiLibrary` opens those locations as usable Base Murtis.
- `StudioSession` decides which Base Murti the person is editing.

Do not turn seasonal pack activation into Base Murti selection. A festival pack
and a different Base Murti are different product concepts even if they use the
same delivery machinery.

## Module 3: `StudioSession`

### Responsibility

Own the multi-Base-Murti editing experience: the active Base Murti, each Base
Murti's last draft, switching, and delegation of customization intents to the
active `CustomizationSession`.

### Proposed interface

```swift
enum StudioIntent: Equatable, Sendable {
    case chooseBaseMurti(String)
    case customize(CustomizationIntent)
    case openSavedDesign(MurtiRecipe)
}

struct StudioViewState: Equatable, Sendable {
    let availableBaseMurtis: [BaseMurtiSummary]
    let activeBaseMurtiID: String
    let editor: CustomizationViewState
}

struct StudioSession: Sendable {
    private(set) var current: StudioViewState

    mutating func perform(_ intent: StudioIntent) -> StudioOutcome
    func renderCurrent(scale: Int) throws -> LocalStillExport
}
```

`StudioSession` composes the existing `CustomizationSession`; it should not copy
its undo, preset, compatibility, or view-state logic.

### Switching policy for the lean release

- The first time a Base Murti is selected, open its default recipe.
- Keep one last draft and one independent undo/redo history per Base Murti for
  the current app session.
- Switching back restores that Base Murti exactly.
- Opening a saved design resolves its pack, activates that Base Murti, and opens
  the recipe.
- Do not translate selections across postures in the pilot.

Later, `designFamilyID` can support an explicit “Apply the same style” intent.
That mapping belongs inside `StudioSession` or a private mapping module, never in
SwiftUI.

### Why the view should not own this

If `EditorScreen` switches catalogs, recreates persistence, maps recipes, and
chooses pack folders itself, every new Base Murti increases view complexity.
With `StudioSession`, the view only presents `StudioViewState` and sends intents.

## Persistence and saved designs

### Current draft

Replace the single-recipe payload with a studio draft envelope:

```swift
struct StudioDraftEnvelope: Codable, Equatable, Sendable {
    let schemaVersion: Int
    var activeBaseMurtiID: String
    var recipesByBaseMurtiID: [String: MurtiRecipe]
}
```

The persistence module should expose `restore(using:)` and `save(_:)`, while
serialization, per-pack migration, corrupt-record recovery, and default fallback
remain inside.

Migration from `current.murti.recipe.v1` is straightforward: decode the old
recipe, store it under its `postureID`, and make it active. Preserve the old key
until the new envelope has been written successfully.

### Saved-design library

Change `SavedDesignLibrary` from one-catalog validation to library resolution:

- saving resolves and validates through `BaseMurtiLibrary`;
- opening returns the recipe; `StudioSession` activates the correct pack;
- restoring processes records independently;
- a temporarily unavailable pack marks a record unavailable but preserves it;
- a permanently invalid recipe may still be dropped with the existing recovery
  report.

Do not create one saved-design database per Base Murti. The user owns one design
library containing designs from multiple Base Murtis.

## Rendering and generation

### Remove location leakage

`ResolvedComposition.assetPackFolderResource` should disappear from the external
interface. It exposes an implementation detail and causes both preview and
export callers to reconstruct `AssetPackRuntime`.

The loaded `MurtiPack` should render both preview and export. Internally it may
cache the compiled manifest and decoded image data. This gives:

- one manifest compilation per opened pack rather than per preview/export;
- identical preview and export resolution;
- one place for typed errors and logging;
- no posture-specific folder branch in SwiftUI.

For the first implementation, rendering may remain synchronous behind
`MurtiPack.render`. A UI model can call it in a detached task. Add an actor/cache
only after profiling proves repeated decode cost matters.

### Generation

`StillGenerationSheet` must receive the active resolved pack or a prepared
generation context. It must never construct `.cuteBal`.

The prompt should use Base-Murti metadata from the pack instead of hard-coding
“seated.” The invariant set may be shared, while posture-specific language such
as mudra, trunk path, limb count, held-object socket, and pose description comes
from reviewed manifest metadata.

The safe sequence remains:

```text
MurtiPack validates recipe
  -> MurtiPack renders exact pixels
  -> MurtiPack builds reviewed generation vocabulary
  -> generation adapter receives immutable envelope
```

## UI integration

Add a `BaseMurtiPickerScreen` above the editor. It reads only
`availableBaseMurtis` and sends `.chooseBaseMurti(id)`.

The existing editor receives the active `CustomizationViewState`. Rename
`CuteMurtiCanvas` to `MurtiCanvas`; use `summary.canvas` rather than a hard-coded
size. Accessibility copy should also come from the active Base Murti summary.

For the pilot, bundle both packs. Remote download, pricing, pack badges, and
cross-posture style transfer are deliberately deferred.

## Testing at module interfaces

Tests should exercise the same interfaces used by callers. Replace tests that
assert hard-coded folder strings or reach into compilation details once the new
module tests cover that behaviour.

### `MurtiPackTests`

- loads the existing v2 pack through the legacy adapter;
- loads a minimal v3 second-Base-Murti fixture;
- default recipe validates and renders;
- every selectable Variant renders in its slot;
- wrong `postureID`, wrong `baseVersion`, and cross-pack Variant IDs fail;
- scale 1 and scale 2 return the expected dimensions;
- release policy rejects pending reviews;
- prompt vocabulary names the active Base Murti and never says “seated” for the
  new posture unless its metadata says so.

### `BaseMurtiLibraryTests`

- lists two Base Murtis in authored order;
- opens each by ID;
- resolves each recipe to its own pack;
- rejects duplicate Base Murti IDs;
- reports unavailable content without deleting the recipe;
- applies only the migration registry belonging to the resolved Base Murti.

### `StudioSessionTests`

- starts on the bundled default;
- switches to the second Base Murti's default;
- preserves separate drafts and histories when switching back and forth;
- rejects cross-pack customization intents without changing state;
- opens a saved design and activates its Base Murti;
- reset affects only the active Base Murti;
- rendering after a switch uses the active pack.

### Persistence and library tests

- migrates the old single current recipe into `StudioDraftEnvelope`;
- round-trips two current drafts;
- restores a mixed saved-design library;
- preserves an unavailable-pack design;
- corrupt data for one saved design does not erase valid neighbors.

### UI smoke tests

- both Base Murti cards appear;
- choosing either opens the same editor chrome with different content;
- switching back restores the prior visible selections;
- preview, share export, and generation sheet use the same active recipe.

## Lean implementation sequence

Each step should leave the current Base Murti working and shippable.

### Commit 1: characterize the current external behaviour

- Add tests for current default restore, selection, preview render, export, and
  generation handoff.
- Record the existing Base Murti ID, canvas, default recipe, and output hash.
- Do not refactor yet.

### Commit 2: make pack content complete

- Define manifest v3 presentation and generation metadata.
- Extend the compiler to read it.
- Convert the existing pack or provide a v2 legacy adapter.
- Prove the generated catalog matches the current visible slots and Variants.

### Commit 3: introduce `MurtiPack` with only the existing Base Murti

- Move catalog creation, runtime loading, rendering, and prompt vocabulary behind
  `MurtiPack`.
- Inject the loaded pack into editor and generation flows.
- Remove `.cuteBal` and `bal-seated-crowns-v2` from view code.
- Preserve the current UI and persisted recipe bytes.

Gate: all existing behaviour and golden output remain unchanged.

### Commit 4: introduce `BaseMurtiLibrary` with one registered pack

- Register the current bundled pack.
- Route recipe resolution and migrations through the library.
- Update saved-design validation to use the library.

Gate: the app still shows one Base Murti and behaves identically.

### Commit 5: introduce `StudioSession` and multi-draft persistence

- Wrap the existing `CustomizationSession`.
- Migrate the old single-recipe store into the studio envelope.
- Make `EditorScreen` render `StudioViewState` and send `StudioIntent`.

Gate: no second Base Murti yet; switching machinery is tested with in-memory
fixtures.

### Commit 6: add the second Base Murti pilot fixture and pack

- Register the new pack with one default plus one alternative per pilot slot.
- Run compiler validation, exhaustive pilot combinations, and golden renders.
- Confirm current Base Murti output hashes remain unchanged.

### Commit 7: expose the Base Murti picker

- Add the two-card picker and change-Base-Murti action.
- Preserve an independent draft for each Base Murti.
- Add product telemetry keyed by Base Murti ID, never by folder resource.

### Commit 8: remove transitional paths

- Delete `CustomizationCatalog.cuteBal` once all data is pack-authored.
- Delete `editingCatalog(extending:)` and the external
  `assetPackFolderResource` field.
- Replace old tests at the new module interfaces instead of layering duplicate
  tests over both designs.

## Expansion gate

Do not re-author the full accessory catalog merely because the second pack can
load. Expand only after the pilot proves:

- the second Base Murti is voluntarily selected;
- customization/save/generation rates are healthy;
- all pilot combinations pass pixel and cultural review;
- generation preserves the new posture;
- actual art time per fitted Variant is understood.

The code gate is equally strict: a third test Base Murti must be addable without
editing `EditorScreen`, `StillGenerationSheet`, `HighResolutionStillExporter`,
or `SavedDesignLibrary`. If those files need posture-specific changes, the
modules are not deep enough yet.

## Explicit non-goals

- No generic protocol for every struct. Introduce a seam only where two adapters
  exist or behaviour genuinely varies.
- No global mega-catalog containing cross-posture Variant pixels.
- No runtime scaling or warping of fitted accessories between postures.
- No silent selection translation when switching Base Murti.
- No manifest path or bundle resource names in SwiftUI state.
- No remote delivery work until the bundled two-pack experience is proven.
- No rename of persisted `postureID` in the pilot. It can gain a clearer
  `baseMurtiID` representation in a future recipe schema migration; changing the
  serialized key now adds risk without enabling the second pack.

## Definition of done for the code foundation

- Two bundled Base Murtis appear through `BaseMurtiLibrary`.
- The same editor edits either one without posture branches.
- Each has independent defaults, Variants, undo/redo, current draft, and saved
  designs.
- Preview, high-resolution export, and generation resolve through the same
  loaded `MurtiPack`.
- Cross-pack recipes and Variant IDs fail with typed errors.
- Unavailable packs preserve user-owned recipes.
- Adding a third fixture requires content registration and tests, not edits to
  product callers.
