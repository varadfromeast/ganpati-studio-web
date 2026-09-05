# Standing Ganpati mala geometry: deep-module plan

Status: proposed

## Outcome

Fit one approved Marigold Mala to the standing/Dancing Joy Base Murti, lock its
anatomical attachment contract in code, and then reuse that exact contract for
all four existing mala designs.

The extension rule is:

> Adding a standing Mala Variant may add artwork/style data, but it must not add
> new attachment points, path code, per-side sampling rules, or pose-specific
> offsets.

In repository terms, "standing Ganpati" is `murti.bal-dancing.v1` in
`bal-dancing-geometry-v1`.

## Current failure, precisely

Before the shoulder calibration, the standing pack declared this anatomical
triangle:

| Landmark | Canonical pixel |
| --- | ---: |
| Left attachment | `(350, 765)` |
| Right attachment | `(585, 750)` |
| Center drop | `(456, 1055)` |

The paths are intentionally asymmetric because the shoulder line, trunk, and
drape are asymmetric:

```text
left:  (350,765) -> (321,840) -> (343,980) -> (456,1055)
right: (585,750) -> (623,824) -> (579,980) -> (456,1055)
```

The original geometry declaration was not the immediate cause of the first
visible miss. In
`build_garland()`, the right path discards its first equal-arc sample with
`samples = samples[1:]`. The actual first right flower is consequently centered
near `(595.9, 784.1)`, which is `35.8 px` from the declared attachment. The left
flower is centered exactly on `(350, 765)`.

The thread still begins at the right attachment, so a weak alpha-in-radius test
can pass even while the floral body looks detached. This is why the manifest
and current compiler validation do not catch the defect.

Two adjacent contract problems should be corrected during the pilot:

- The original socket's scalar `anchor` was `(456, 758)`: drop `x` plus average
  shoulder `y`. After the right-shoulder calibration, the rounded attachment
  midpoint is `(485, 743)` using the runtime's half-up pixel rule.
- The manifest calls the model `threePointAffineV1`, although the pixels are
  produced by two cubic paths with equal-arc sampling. The manifest should name
  the actual model, proposed as `twoCurveGarlandFitV1`.

## Geometry to lock for the Marigold pilot

The diagnostic review subsequently moved the viewer-right endpoint onto the
inner shoulder/drape seam. These calibrated points are the locked shared
socket; Variant-specific offsets remain forbidden.

### Pose-owned landmarks

- `leftAttach`: the hidden cord/body contact immediately below the left neck
  seam, currently `(350, 765)`.
- `rightAttach`: the visible contact on the viewer-right inner shoulder/drape
  seam, calibrated to `(620, 720)`.
- `centerDrop`: the shared low point near the standing murti's navel,
  calibrated to `(390, 950)`.
- `leftControl1`, `leftControl2`: calibrated to `(321, 830)`, `(332, 905)`.
- `rightControl1`, `rightControl2`: calibrated to `(650, 800)`, `(548, 910)`.
- `trunkOccluderPolygon`: the existing 13-point polygon remains pose-owned and
  is generated from the same socket value used in the manifest.

Coordinates remain canonical top-left pixels on the `941 x 1672` canvas. Do not
normalize them in authoring code; normalization would add rounding without
buying reuse because every Variant in this Asset Pack shares the canvas.

### Endpoint rule

Both paths must render their `t=0` sprite at the declared attachment. Only the
right path's final `t=1` sample may be omitted, because the left path already
owns the single center-drop flower.

The right endpoint flower is allowed to be partly hidden. It must be rendered
in full first, then covered by `fixed.trunk-foreground.bal-dancing.v1`. The
fitter must not simulate occlusion by deleting samples.

If the complete endpoint flower produces an unattractive sliver after
occlusion, adjust one of these pose/style facts explicitly and review again:

1. right attachment within a maximum `8 px` calibration window;
2. right endpoint scale/taper shared by every mala;
3. the trunk occluder polygon.

Do not restore `samples[1:]`, add a right-only per-Variant offset, or move the
whole Mala Variant.

### Curve and placement rules

- Sample each cubic by equal arc length, never equal parameter `t`.
- Place one sprite at each attachment and one shared sprite at the center drop.
- Align sprites to the local tangent.
- Apply endpoint taper as a continuous function of path position.
- Permit artwork rhythm/phase and sprite sizes to vary by Mala Variant.
- Keep attachments, controls, drop, occlusion, endpoint ownership, and path
  sampling identical across all standing Mala Variants.
- Preserve transparent RGB normalization so regenerated layers remain
  deterministic.

## Deep module

Create `scripts/accessory_fitting/garland.py`, beside the existing deep
headwear module. It owns all geometry math and rendering behavior currently
duplicated between `build_garland_collection.py` and
`build_dancing_joy_accessories.py`.

### Small interface

```python
@dataclass(frozen=True)
class GarlandSocket:
    canvas_size: tuple[int, int]
    left_attachment: Point
    right_attachment: Point
    center_drop: Point
    left_controls: tuple[Point, Point]
    right_controls: tuple[Point, Point]
    occluder_polygon: tuple[Point, ...]

    def manifest_geometry(self) -> dict[str, object]: ...


@dataclass(frozen=True)
class GarlandDesign:
    sprite_sequence: tuple[str, ...]
    spacing: float
    widths: tuple[float, ...]
    thread_width: int
    phase: float = 0.0
    centerpiece: Centerpiece | None = None


def fit_garland(
    sprites: Mapping[str, Image.Image],
    socket: GarlandSocket,
    design: GarlandDesign,
) -> Image.Image: ...
```

Cubic evaluation, dense arc-length lookup, tangent rotation, endpoint ownership,
tapering, thread drawing, alpha cropping, resizing, and transparent pixel
cleanup are implementation details. Callers provide anatomy, artwork, and
style; they do not manipulate samples.

`GarlandSocket.manifest_geometry()` must serialize the exact landmarks,
controls, placement policy, taper policy, and occluder polygon that produced the
pixels. No build script should hand-assemble a second copy of that JSON.

The interface deliberately supports the component-sampled malas that actually
exist. Do not add a raster-warp adapter until a painted full-mala source needs
one. One adapter would only create a hypothetical seam.

### Why this module is deep

If deleted, cubic math, arc-length sampling, endpoint behavior, sprite fitting,
center-drop deduplication, manifest serialization, and fit invariants would
reappear in at least the seated and standing pack builders. Keeping that
behavior behind `fit_garland(...)` gives leverage to every Mala Variant and
locality to future attachment fixes.

The interface is also the test surface. Tests should fit marker sprites through
`fit_garland`; they should not call a private sampler or duplicate its math.

## Fit-mask and occlusion contract

The current fit mask is copied from the rendered Marigold alpha. That describes
what one Variant happened to draw, not the safe region every Variant may use.

Replace it with a pose-owned chest envelope generated from the locked left and
right paths, dilated by the approved maximum flower radius, plus the approved
centerpiece area. Then validate every Mala Variant against that envelope.

The final occlusion order stays:

```text
Base Murti -> Mala front layer -> fixed trunk foreground -> Crown
```

For this Base Murti, one front Mala layer plus the existing fixed trunk
occluder is sufficient. Do not introduce public back/front roles unless a real
Mala Variant requires another crossing that the fixed foreground cannot
represent.

## Implementation phases

### Phase 1: protect the current evidence

1. Add a regression test that fits a distinctive marker sprite and proves both
   `t=0` markers land on their declared attachments.
2. Add a test that captures the current defect: the shipped right floral body
   starts about `35.8 px` after its attachment.
3. Record the current composite and a neck/chest crop as pre-fix review
   artifacts. Do not use them as desired goldens.

### Phase 2: lock one Marigold Mala

1. Extract the deep module without changing the approved seated outputs.
2. Define one `DANCING_GARLAND_SOCKET` in code using the baseline points above.
3. Render sample zero on the right; omit only the duplicated center-drop sample.
4. Generate a diagnostic overlay containing:
   - colored left/right/drop landmarks;
   - both cubic centerlines and control handles;
   - every sampled sprite center;
   - the trunk occluder polygon and its actual alpha;
   - the pose-owned fit envelope;
   - pixels outside the envelope in red.
5. Review two magnified crops: pre-occlusion and final composite. The right
   endpoint should read as tucked under the trunk/neck seam, not floating and
   not pasted over the trunk.
6. If needed, calibrate only the shared socket within the bounds stated above,
   rerun the diagnostics, then declare the socket `locked` in
   `authoringTuning`.
7. Regenerate the layer, fit mask, thumbnail, reference composite, content
   hashes, authoring manifest, and runtime pack from the one build path.

The pilot is complete only when technical visual review approves the Marigold
Mala at full canvas, editor preview size, and a 2x neck/chest crop.

### Phase 3: transform the remaining malas

Move the four existing seated style descriptions into data consumed by the
deep module:

| Design family | Standing output | Geometry override allowed? |
| --- | --- | --- |
| `garland.marigold` | `garland.marigold.bal-dancing.v1` | No |
| `garland.rose` | `garland.rose.bal-dancing.v1` | No |
| `garland.rose-flowing` | `garland.rose-flowing.bal-dancing.v1` | No |
| `garland.lotus-jasmine` | `garland.lotus-jasmine.bal-dancing.v1` | No |

Each may retain its existing sprite sequence, spacing, widths, phase, thread
width, and centerpiece style. Every one must use the locked standing socket.
The lotus centerpiece may declare artwork-local size and center-drop offset,
but it may not move either strand or either attachment.

Manual artwork work is allowed here: a source flower can be cropped, cleaned,
or visually tuned, and its size/phase can be chosen by eye. The accepted values
must then be recorded in `GarlandDesign` so a clean build reproduces the same
pixels. Do not ship a flattened layer that depends on an unrecorded canvas drag,
scale, or warp.

For every new Variant, generate its canonical layer, thumbnail, reference
composite, manifest entries, content hashes, and runtime copy. Add a stable
`designFamilyID` when the manifest schema supports it so seated and standing
pixels can be associated without reusing Variant IDs.

### Phase 4: remove duplicate geometry

Refactor `build_garland_collection.py` to use the same module for the seated
socket. Delete its local `Point`, `CubicBezier`, sampler, tangent placement, and
renderer after interface-level tests cover both postures.

Do the same cleanup in `build_dancing_joy_accessories.py`. The standing build
script should contain only the standing socket, Mala design data, asset paths,
pack assembly, and review artifact generation.

### Phase 5: strengthen ingest validation

Update both the Python asset-pipeline validator and the Swift
`AssetPackCompiler` to validate `twoCurveGarlandFitV1`:

- exactly two attachments, one center drop, and four control points;
- all points inside the canonical canvas;
- scalar anchor equals the rounded attachment midpoint;
- each path starts at its corresponding attachment and ends at center drop;
- drop lies below both attachments;
- occluder polygon has at least three in-canvas points and resolves to a fixed
  Base Murti foreground layer;
- placement policy is the supported equal-arc/tangent policy;
- tuning status is `locked` before release eligibility.

The compiler can validate manifest structure. Pixel/geometry agreement remains
an authoring-pipeline responsibility because the app does not rerender source
flowers at runtime.

## Tests and acceptance criteria

### Deep-module tests

- Both endpoint marker sprites land within `2 px` of their attachments.
- The two curves produce one, and only one, center-drop sprite.
- Equal-arc center distances stay within `2 px` of the requested spacing except
  for the final residual interval.
- A horizontal test socket yields the expected tangent rotations.
- Empty sprites, non-positive spacing/widths, mismatched sequences/widths,
  coincident attachments/drop, and out-of-canvas geometry fail with clear
  errors.
- Repeated calls with identical inputs produce byte-identical RGBA output.

### Standing Marigold tests

- The built layer is byte-identical to `fit_garland(...)` using the locked
  socket and Marigold design.
- A non-thread endpoint marker proves the right floral body occupies the right
  attachment before occlusion.
- Along each centerline, every sampled neighborhood is covered by either Mala
  alpha or the declared trunk occluder; no uncovered gap may bridge an
  attachment to the first visible flower.
- All visible Mala pixels are inside the pose-owned fit envelope.
- The foreground trunk fully hides pixels declared occluded; no flower appears
  painted across the trunk.
- Alpha bounds remain within an approved range recorded only after visual sign
  off; bounds are a regression guard, not the definition of fit.
- Authoring and runtime manifests expose the same Mala catalog and hashes.

### Collection tests

- All four standing Malas use the same serialized `fitGeometry` and socket ID.
- No standing `GarlandDesign` contains attachment points, path controls, or a
  whole-layer translation.
- Every Variant occupies both pre-occlusion attachments and the shared drop.
- Each Variant passes fit-envelope, occlusion, deterministic-render, thumbnail,
  and hash checks.
- Golden composites cover each Mala alone and at least the highest-risk Crown +
  Mala combinations at editor and export sizes.

## Proposed file changes

- Add `scripts/accessory_fitting/garland.py`.
- Export its small interface from `scripts/accessory_fitting/__init__.py`.
- Refactor `scripts/build_dancing_joy_accessories.py` around one standing socket
  and four `GarlandDesign` values.
- Refactor `scripts/build_garland_collection.py` to remove duplicated geometry
  implementation.
- Add `tools/layered-master/tests/test_garland_fitting.py` for the module.
- Add `tools/layered-master/tests/test_dancing_garland_fit.py` for the standing
  Asset Pack contract.
- Extend `tools/asset-pipeline/src/ganpati_asset_pipeline/pipeline.py` and
  `GanpatiStudio/AssetPack.swift` for the truthful fit model and locked tuning.
- Regenerate only the affected files in `assets/packs/bal-dancing-geometry-v1`
  and its runtime copy after the Marigold visual review passes.

## Commit sequence

1. Add failing endpoint and manifest-truth tests.
2. Extract the garland fitting module with seated output parity.
3. Fix and visually lock the standing Marigold attachment contract.
4. Add ingest validation for the locked two-curve geometry.
5. Add the other three standing Mala Variants through the same socket.
6. Regenerate runtime artifacts and goldens, then run the complete Swift and
   Python suites.

This sequence keeps the first visual judgment isolated. The later collection
expansion is then a data exercise over a locked deep module rather than four
independent fitting exercises.
