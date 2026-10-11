# Ganpati Studio Asset Pack QA

This module validates a version 2 Asset Pack and renders deterministic QA evidence. Its
interface is the repository wrapper at `scripts/asset_pipeline.py`; callers do not need to
know the manifest-validation, alpha-inspection, or compositing implementation.

## Setup

From the repository root:

```sh
uv sync --frozen --project tools/asset-pipeline
```

`uv.lock` pins the Python runtime and every package. Do not install these dependencies into
the system Python.

## Commands

Validate an Asset Pack and produce `qa-report.json` plus four-background alpha contact sheets:

```sh
uv run --frozen --project tools/asset-pipeline \
  python scripts/asset_pipeline.py validate path/to/manifest.v2.json \
  --output artifacts/asset-qa/my-pack
```

Render the default Design, every single-Variant Design, and every pair declared in
`qa.highRiskPairs`:

```sh
uv run --frozen --project tools/asset-pipeline \
  python scripts/asset_pipeline.py render-goldens path/to/manifest.v2.json \
  --output artifacts/asset-qa/my-pack
```

After art and cultural review approves those renders, copy the `goldens` directory to the
pack's reviewed-golden location. Verification never updates approved goldens:

```sh
uv run --frozen --project tools/asset-pipeline \
  python scripts/asset_pipeline.py verify-goldens path/to/manifest.v2.json \
  --goldens path/to/approved-goldens \
  --output artifacts/asset-qa/my-pack-verification
```

A nonzero exit status blocks ingest. Pixel drift emits a corresponding PNG in `diffs/` and a
machine-readable entry in `qa-report.json`.

Stage a validated authoring pack for the app bundle:

```sh
uv run --frozen --project tools/asset-pipeline \
  python scripts/asset_pipeline.py stage-runtime \
  assets/packs/bal-seated-crowns-v2/manifest.v2.json \
  --output artifacts/runtime-packs/bal-seated-crowns-v2 \
  --policy development
```

Use `--policy development` only while named technical or cultural reviews are pending. It
preserves `releaseEligible: false` in `runtime-pack-report.json`; the default `release` policy
rejects pending reviews.

The staged directory is a reproducible deployment boundary. It contains the byte-identical
manifest and only its referenced runtime layers, socket fit masks, and picker thumbnails.
Authoring evidence (`references/`, `goldens/`, `ledger.json`, and `README.md`) is deliberately
excluded. Relative paths are preserved, every staged byte is recorded in a sorted SHA-256
inventory, and rerunning the command replaces the prior package as a unit. Absolute paths,
`..` traversal, noncanonical paths, symlink escapes, and destinations that overlap the
authoring pack are rejected before any output is changed.

## Enforced gates

- manifest schema version, canonical top-left canvas, references, defaults, and compatibility;
- unique layer, file, and Variant identities;
- in-canvas frames whose dimensions equal their PNGs;
- exact `sha256:` content hashes;
- 8-bit RGB/RGBA decoding, with real alpha required for every swappable layer;
- nonempty alpha bounds and rejection of colored fully-transparent fringe pixels;
- named sockets, in-canvas anchors, hashed nonempty fit masks, and exact required role bindings;
- deterministic z-order, occluder ordering, symmetric exclusions, and declared dependencies;
- rights provenance plus approved named technical and cultural reviews;
- decodable picker thumbnails and reference composites;
- exact RGBA golden comparison, with missing, stale, and changed goldens rejected.
- deterministic runtime staging with a minimal file allowlist and traversal-safe copying.

Warnings such as visible pixels touching a crop edge remain in the report for human seam and
bleed review. The tool cannot automate religious/cultural judgment; it verifies that the
required human approval is recorded and makes the reviewed pixels reproducible.
