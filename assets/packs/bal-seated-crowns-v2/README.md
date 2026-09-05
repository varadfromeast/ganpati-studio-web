# Bal Seated Customization V2

This is a development-only Asset Pack for proving the real fixed-pose
customization seam. It contains one canonical Base Murti, three transparent
canvas-aligned crown candidates, four independently swappable garlands, one
complete ceremonial armor outfit, and three held Modaks. Every allowed
cross-slot combination resolves without regenerating or modifying the Base
Murti.

The pack is deliberately **not release eligible**. Technical fit review,
cultural review, and commercial-rights verification remain pending. The current
front-only layers prove deterministic swapping; production crowns should be
re-authored as back/front layers with a fixed hair occluder wherever the design
crosses the hair silhouette.

Jewel Festival Drape is a second full-body outfit authored from the supplied
teal, magenta, purple, and gold textile reference. Its diagonal shoulder drape,
waist brooch, center pleats, bent-leg panels, and loose side tail are clipped to
canonical-pixel garment envelopes. The builder keys the requested textile
palette, intersects the lower panels with the Base Murti's exact dhoti
silhouette, and subtracts fixed trunk, hand, and foot protections. Because all
outfits share the canonical 941×1672 canvas geometry, garlands remain selected
and render above every outfit.

Every garland is built by `scripts/build_garland_collection.py` against one
approved body geometry. The shared left and right attachment points sit on the
lower-neck seam; two cubic Bezier centerlines bow around the torso and converge
only below the fixed trunk. Small generated flower components are placed at
equal arc-length intervals with tangent rotation and endpoint taper. The image
model never decides the final U shape, attachment position, or drop.

The builder rejects a garland if it misses either attachment, begins outside
the approved vertical band, drops too low, or enters a 10-pixel dilation of the
trunk occluder. A fixed trunk foreground remains as a defensive compositing
layer. The option groups remain pending until fit, fringe, cultural, and
commercial-rights review are signed.

The Modak socket uses one `held` layer below a fixed finger occluder. The
occluder contains exact pixels extracted from the canonical Base Murti, so the
hand remains identical and the sweet visibly stays inside the same grip.

Royal Bal Kavach is the first full-body `outfit` option. Its collar,
breastplate, pauldrons, cuffs, belt, tasset, and leg guards are clipped to a
canonical 941×1672 geometry mask documented in
`docs/ARMOR_OUTFIT_FIT_CONTRACT.md`. It renders below the fixed trunk and Modak
finger occluders. The existing garlands share its canonical canvas geometry and
render above the armor like every other outfit.

Use development validation while reviews are pending. Release validation must
continue to fail until signed review evidence replaces the pending records.
