# Outfit, Seat, and Scene: layered-master implementation plan

Status: tooling and art-handoff contract ready; production art not yet authored

## Decision

Create one artist-owned layered master for `murti.bal-seated.v1`. Do not
generate a different complete Murti for each selection, and do not tune loose
Outfit/Seat PNG offsets over the opaque base. The approved face, posture,
silhouette, mudras, and proportions remain the identity layer.

The deep module is the **layered-master workbench**. Its small interface is one
contract, one exported workspace, and one requested milestone. Its
implementation owns canvas checks, alpha/bounds checks, deterministic draw
order, reference recomposition, checksums, previews, and a machine-readable QA
report. Runtime callers should never learn Photoshop group names or per-item
pixel offsets.

## Why the existing base is insufficient

The current `base.png` is an opaque RGB composite. It permanently contains the
nursery scene, teal-and-gold seat, rose drape, saffron dhoti, body, and their
mutual occlusion. Information hidden behind those pixels does not exist in the
file:

- changing Scene requires a clean background plus an isolated Murti/Seat;
- changing Seat requires the full Murti silhouette independent of the teal
  cushion and gold platform;
- changing Outfit requires neutral body underpaint and exact trunk/hand/foot
  occluders, not a garment sticker laid over the old garment.

No automated segmentation can recover those hidden pixels exactly. The one
unavoidable art task is reconstruction in the layered master. Once done, all
future options are deterministic attachments.

## Canonical draw grammar

| Order | Role | Ownership |
| ---: | --- | --- |
| 0 | `sceneBack` | Opaque replaceable background; no Murti or Seat pixels. |
| 200 | `seatUnderCharacter` | Transparent replaceable Seat, including cushion/platform. |
| 300 | `outfitBack` | Garment pieces behind the fixed body. |
| 400 | `fixedMurtiCore` | Locked identity and neutral underpaint. |
| 500 | `outfitFront` | Garment pieces crossing the core. |
| 700 | `fixedBodyFront` | Exact trunk, hands/fingers, feet, and fixed crossings. |
| 900 | `sceneFront` | Optional petals/lamps only; must not obscure identity. |

Crown, Garland, and held Modak continue through their existing socket contract.
When this master is integrated, their z-order must be merged into the same
grammar rather than copied into this authoring tool.

## Sequenced implementation

1. **Default decomposition**
   - Illustrator imports the approved base into the archival master.
   - Paint a clean nursery plate, remove Seat/Outfit from the Murti core, and
     reconstruct only hidden pixels needed for overlap.
   - Split the existing Outfit into back/front and extract fixed body-front
     occluders from approved pixels.
   - Pass the `decomposition` verifier with reference parity.
2. **One vertical-slice swap per slot**
   - Author peacock-teal Outfit, lotus Seat, and home-mandap Scene in the same
     master coordinates.
   - Review each independently with all existing Crown/Garland/Modak defaults.
   - Correct seams in the master; never add device offsets.
3. **MVP breadth**
   - Complete festive-rose Outfit, carved chowki, and festive courtyard.
   - Pass the `mvp` verifier, then ingest into the existing runtime pack
     compiler and golden-combination suite.
4. **Human gates**
   - Inspect 100%, 50%, and smallest-device renders on light/dark/checkerboard.
   - Record technical, cultural, and commercial-rights approvals by version.

## Acceptance gates

- Default recomposition MAE ≤ 0.5 and changed-pixel ratio ≤ 0.5% versus the
  approved base. Aim for exact equality; the tolerance permits color-managed
  export noise, not redraw drift.
- Every non-scene layer is full-canvas RGBA and transparent outside its paint.
- Outfit edges bleed 4–12 master pixels beneath fixed occluders with no visible
  halo or old-garment pixel.
- Seat never changes body silhouette, feet, posture, or camera perspective.
- Scene never contains baked Murti/Seat pixels and matches the fixed light
  direction, horizon, and floor contact.
- All 27 Outfit × Seat × Scene combinations render offline before adding the
  existing Crown × Garland × Modak combinations to pairwise/high-risk QA.

## Honest current boundary

The contract and verifier are implemented. The required layered PSD and its
exports do not yet exist, so Outfit, Seat, and Scene must remain unavailable or
clearly marked as previews in the product until their options pass these gates.
Raw AI generations cannot be labeled production-ready.
