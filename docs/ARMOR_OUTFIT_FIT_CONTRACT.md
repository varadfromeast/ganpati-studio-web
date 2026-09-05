# Royal Bal Kavach fit contract

Status: development asset; technical and cultural review pending
Canonical posture: `murti.bal-seated.v1`
Canvas: 941 × 1672 pixels, top-left origin

## Why this is not a garland

The current base outfit is a saffron dhoti plus one rose-pink diagonal sash.
It has no fitted upper-body garment: the belly, chest, and shoulders are mostly
exposed. A garland uses three landmarks and a narrow U-shaped safe zone. The
Royal Bal Kavach occupies the neck, shoulders, torso, waist, wrists, thighs,
knees, and ankles, so stretching `garland-chest-zone.png` would necessarily
cross the hands, belly, legs, or trunk. The armor is therefore an `outfit` with
its own multi-part fit mask and foreground occlusion contract.

The armor replaces the garland in this first version. The design intentionally
has no necklace loop, and the app must resolve an armor selection to
`garland.none.v1`. A later reviewed garland can be allowed only after a pairwise
fit proves that it remains outside the collar and breastplate relief.

## Canonical geometry

All points below are measured on the canonical base, never on a phone preview.
Normalized coordinates are `x / 941` and `y / 1672`.

| Landmark | Pixel coordinate | Normalized coordinate | Purpose |
|---|---:|---:|---|
| Neck left | (344, 842) | (0.366, 0.504) | left collar termination |
| Neck right | (614, 842) | (0.652, 0.504) | right collar termination |
| Left shoulder | (307, 900) | (0.326, 0.538) | pauldron center |
| Right shoulder | (646, 900) | (0.686, 0.538) | pauldron center |
| Chest center | (470, 965) | (0.499, 0.577) | breastplate symmetry axis |
| Waist center | (470, 1120) | (0.499, 0.670) | belt keystone |
| Left wrist | (271, 1016) | (0.288, 0.608) | fitted cuff axis |
| Right wrist | (669, 1034) | (0.711, 0.618) | fitted cuff axis |
| Left knee | (300, 1185) | (0.319, 0.709) | curved thigh guard center |
| Right knee | (640, 1185) | (0.680, 0.709) | curved thigh guard center |
| Tasset end | (470, 1282) | (0.499, 0.767) | must remain above toes |

The usable outfit envelope is approximately `(198, 817)–(746, 1314)`, or
58.2% of canvas width by 29.7% of canvas height. The breastplate width is 299 px
at the neck/upper torso and 310 px at the waist, matching the base's expanding
belly silhouette. The left and right knee centers are 170 px from the vertical
body axis, which preserves the seated bilateral rhythm without making the
character wider.

## Occlusion and invariants

The outfit renders above the base and below `fixed.trunk-foreground.v1` and
`fixed.offering-fingers.v1`. Its authored polygons stop before the blessing
palm, modak grip, face, ears, hair, crossed toes, and seat. The crown remains a
separate slot and is never baked into this asset.

Release validation must reject armor pixels outside `outfit-full-body-zone.png`,
a tasset below y=1282, shoulder expansion beyond x=257…696, or any visible
pixel intersecting protected face, palm, modak, or toe regions. Technical and
cultural review remain pending.
