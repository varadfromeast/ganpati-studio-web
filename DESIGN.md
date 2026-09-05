---
name: Ganpati Studio
description: A reverent digital shringar atelier shaped by Mumbai sign-painter craft.
colors:
  cobalt-950: "#03294f"
  cobalt-900: "#063d78"
  cobalt-800: "#07569a"
  cobalt-700: "#0e6aaf"
  teal-800: "#086966"
  teal-600: "#0a8d86"
  vermilion-700: "#a92f24"
  vermilion-600: "#ca4935"
  rose-600: "#d33868"
  marigold-500: "#f0a10b"
  marigold-400: "#ffbd24"
  leaf-700: "#24704a"
  paper: "#f3e8d7"
  paper-light: "#fffaf1"
  chalk: "#fff9eb"
  ink: "#1d2029"
  ink-blue: "#102944"
  muted-blue: "#52677b"
  line-blue: "#aec3d2"
typography:
  display:
    fontFamily: "Yatra One, serif"
    fontSize: "clamp(3.15rem, 6.2vw, 5.8rem)"
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Yatra One, serif"
    fontSize: "clamp(2.35rem, 5vw, 4.8rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Yatra One, serif"
    fontSize: "clamp(1.85rem, 3vw, 2.6rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Anek Devanagari Variable, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Anek Devanagari Variable, Noto Sans Devanagari, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.06em"
rounded:
  micro: "4px"
  control: "12px 12px 4px 4px"
  plaque: "16px 16px 6px 6px"
  sheet: "24px 24px 8px 8px"
  arch: "46% 46% 14px 14px / 9% 9% 14px 14px"
  circle: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  action-plaque-primary:
    backgroundColor: "{colors.vermilion-700}"
    textColor: "{colors.chalk}"
    typography: "{typography.title}"
    rounded: "{rounded.plaque}"
    padding: "15px 20px 15px 16px"
  action-plaque-secondary:
    backgroundColor: "{colors.teal-800}"
    textColor: "{colors.chalk}"
    typography: "{typography.title}"
    rounded: "{rounded.plaque}"
    padding: "15px 20px 15px 16px"
  button-blue:
    backgroundColor: "{colors.cobalt-900}"
    textColor: "{colors.chalk}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
    height: "48px"
  button-paper:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.cobalt-950}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "11px 17px"
    height: "48px"
  finish-button:
    backgroundColor: "{colors.marigold-500}"
    textColor: "#571d11"
    typography: "{typography.title}"
    rounded: "16px 16px 5px 5px"
    padding: "13px 22px"
    height: "62px"
  field:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
    height: "47px"
  variant-tile:
    backgroundColor: "#f7eddd"
    textColor: "{colors.ink-blue}"
    typography: "{typography.body}"
    rounded: "14px 14px 5px 5px"
    padding: "8px 8px 12px"
  variant-tile-selected:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink-blue}"
    typography: "{typography.body}"
    rounded: "14px 14px 5px 5px"
    padding: "6px 6px 10px"
  bottom-navigation:
    backgroundColor: "{colors.paper-light}"
    textColor: "{colors.muted-blue}"
    typography: "{typography.label}"
    rounded: "18px 18px 7px 7px"
    height: "64px"
    width: "min(calc(100% - 24px), 620px)"
  design-card:
    backgroundColor: "{colors.cobalt-900}"
    textColor: "{colors.chalk}"
    rounded: "43% 43% 8px 8px / 8% 8% 8px 8px"
    padding: "6px"
  artwork-stage:
    backgroundColor: "{colors.vermilion-600}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.arch}"
    padding: "10px"
    width: "520px"
---

# Design System: Ganpati Studio

## Overview

**Creative North Star: "The Painted Shringar Atelier"**

Ganpati Studio feels like a premium Mumbai sign-painter's workshop prepared for festival making: deep cobalt-painted architecture, enamel-red labels, marigold action marks, warm paper work surfaces, and honest ink outlines. The world is reverent and joyful, with tactile craft framing the artwork instead of ornamental temple chrome or generic luxury styling.

The interface is dense enough for real making but visually calm around the Base Murti. Architectural color fields establish place, paper carries focused work, and the recurring arch gives finished artwork ceremonial presence. Motion is restrained: one curtain-like reveal introduces the stage, while direct state changes keep customization precise and trustworthy.

**Key Characteristics:**

- Deep cobalt architecture with sparse painted texture
- Warm matte paper for concentrated working surfaces
- Vermilion enamel labels and marigold action signals
- Yatra One display type paired with multilingual Anek Devanagari
- Tactile plaques, clipped signboard corners, and a singular ceremonial arch
- Visible selection, focus, privacy, and progress states
- Restrained reveal motion with instant fitted-Variant feedback

## Colors

The palette combines workshop pigments with paper-and-ink neutrals; each saturated color has a job rather than acting as decoration.

### Primary

- **Workshop Cobalt** (`cobalt-950` through `cobalt-700`): The architectural ground, navigation structure, artwork frames, and legible blue interaction states.

### Secondary

- **Enamel Vermilion** (`vermilion-700`, `vermilion-600`): Primary action plaques, selected material labels, and expressive headings.
- **Signal Marigold** (`marigold-500`, `marigold-400`): Completion actions, focus outlines, frame edges, progress marks, and small moments of emphasis.

### Tertiary

- **Peacock Teal** (`teal-800`, `teal-600`): Alternate journeys, supportive actions, and cool counterpoint to vermilion.
- **Festival Rose** (`rose-600`): A sparingly used material accent.
- **Leaf Green** (`leaf-700`): Confirmed, successful, or locked states only.

### Neutral

- **Workshop Paper** (`paper`): Secondary work surfaces and material tiles.
- **Fresh Paper** (`paper-light`): Primary reading and form surfaces.
- **Chalk White** (`chalk`): Warm text and linework over saturated paint.
- **Workshop Ink** (`ink`, `ink-blue`): Primary text and high-contrast marks.
- **Faded Blueprint** (`muted-blue`): Supporting copy and metadata.
- **Blueprint Line** (`line-blue`): Quiet control and divider strokes.

### Named Rules

**The Painted Architecture Rule.** Cobalt is the structural page ground; warm paper is a working surface, never the default atmospheric backdrop.

**The Marigold Signal Rule.** Reserve marigold for action, focus, progress, and artwork framing so its scarcity preserves meaning.

**The Status Has Meaning Rule.** Green means confirmed or safe, teal means an alternate path, and rose never substitutes for an interaction state.

## Typography

**Display Font:** Yatra One (with serif fallback)
**Body Font:** Anek Devanagari Variable (with Noto Sans Devanagari, system UI, and sans-serif fallbacks)
**Label Font:** Anek Devanagari Variable

**Character:** Yatra One brings the hand-painted workshop voice to short devotional headlines without imitating sacred calligraphy. Anek Devanagari carries every operational label and paragraph with clear Latin, Hindi, and Marathi rendering.

### Hierarchy

- **Display** (400, fluid 50–93px, 0.92 line-height): Hero statements only; keep them short and balanced.
- **Headline** (400, fluid 38–77px, 1 line-height): Page titles and decisive result moments.
- **Title** (400, fluid 30–42px, 1 line-height): Section, card, and modal headings.
- **Body** (400, 16px, 1.45 line-height): Instructions and explanatory copy; working paragraphs generally stop between 55ch and 75ch.
- **Label** (700, 12–13px, tracked): Compact navigation, status, progress, and metadata; uppercase is reserved for short workshop marks.

### Named Rules

**The Two-Voices Rule.** Yatra One speaks for ceremony and invitation; Anek Devanagari handles every instruction, control, status, and multilingual message.

**The Short Sign Rule.** Never set paragraphs or long operational labels in the display face.

## Layout

The system alternates between broad painted architecture and bounded paper work zones. Marketing content is centered in containers up to 1500px; task and library content usually caps between 1200px and 1240px. Desktop studio work uses three zones—112px slot rail, art stage, and flexible material inspector—while the 1120px breakpoint tightens the rail and changes material grids from three columns to two.

At 900px and below, multi-column journeys stack and the studio becomes stage, horizontal slot rail, then material wall. At 640px and below, gutters contract from 22px to 14px, modal sheets dock to the bottom, tool labels compress, and the finish action becomes a safe-area-aware fixed dock. At 410px and below, library grids become single-column while material choices remain a compact two-column grid.

Spacing follows a 4px base with recurring 8px, 12px, 16px, 24px, and 32px steps. Touch controls are ordinarily at least 44–48px tall, and primary task actions are 56–84px tall. Responsive behavior preserves the artwork's proportions rather than stretching phone geometry across wide screens.

## Elevation & Depth

Depth is a hybrid of graphic offset lift and rare ambient shadow. Paper fields remain mostly matte; tactile controls receive compact ink-colored lift, while the central artwork stage and modal sheet receive the only broad ambient shadows. Painted borders, layered insets, and tonal contrast do most of the structural work.

### Shadow Vocabulary

- **Soft Stage** (`0 22px 60px rgb(1 24 50 / 22%)`): Broad ambient separation for artwork, bottom navigation, and large media frames.
- **Tactile Lift** (`0 10px 28px rgb(1 24 50 / 20%), 0 2px 6px rgb(1 24 50 / 12%)`): Compact lift for cards, banners, and selectable structural objects.
- **Raised Plaque** (`0 12px 26px rgb(1 24 50 / 26%)`): Resting shadow for large action signs; hover increases lift while moving upward 3px.
- **Modal Depth** (`0 30px 90px rgb(0 15 35 / 48%)`): Reserved for blocking sheets over the blurred cobalt backdrop.

### Named Rules

**The Stage Earns Atmosphere Rule.** Broad ambient shadow belongs to the artwork stage, modal sheet, and persistent navigation—not every paper container.

**The Lift Must Answer Rule.** Hover lift is small, fast, and paired with a border or saturation response; decorative floating is not part of the system.

## Shapes

The form language comes from painted plaques and built workshop apertures. Controls use modest clipped signboard corners—typically 10–16px across the top and 3–6px below—rather than uniform pills. Large sheets use 24px top corners with an 8px lower cut. Circles are reserved for icon wells, status seals, and utilities.

The recurring arch uses roughly 43–48% upper radii and restrained 7–18px lower corners, often with a 3px marigold outer edge and a light inner line. Rectangular dividers, registration ticks, and one-corner cuts keep the composition from becoming soft or ornamental.

**The One Arch Rule.** The Base Murti, finished Design, or devotional video receives the dominant arch; ordinary cards and controls use signboard corners.

**The No Pill Field Rule.** Do not turn categories, fields, or navigation into a field of interchangeable capsules.

## Components

### Buttons

- **Shape:** Tactile signboard corners with a clipped lower edge (`12px 12px 4px 4px`); primary plaques expand to `16px 16px 6px 6px`.
- **Primary:** Vermilion action plaques pair chalk text with a pale marigold edge and roomy asymmetric padding; the final task action switches to solid marigold with dark ink.
- **Hover / Focus:** Plaques rise 2–3px over 190–240ms using the standard expressive ease; all controls share a 3px marigold focus outline offset by 4px.
- **Secondary / Paper:** Teal distinguishes the alternate creation path. Paper buttons keep a warm surface, cobalt text, and a firm tan border.
- **Disabled:** Preserve the component shape and copy while reducing opacity; never replace an unavailable action with ambiguous color alone.

### Chips

- **Style:** Suggestion and personalization chips are compact paper signboards, not pills, with 10–11px top corners and 3–4px lower cuts.
- **State:** Selected language controls invert to cobalt with chalk text and a 2px border; Variant selection adds a 3px vermilion border plus a green check, so color is never the only cue.

### Cards / Containers

- **Corner Style:** Work cards use small signboard corners; proof-bearing Design cards use the ceremonial arch.
- **Background:** Paper or fresh paper on reading surfaces; cobalt under media and dense navigation.
- **Shadow Strategy:** Flat at rest unless the object is selectable, persistent, or proof-bearing.
- **Border:** Use 1px dividers, 2px control borders, and 3px structural stage edges.
- **Internal Padding:** Compact cards use 8–16px; task sheets use 24–46px according to viewport.

### Inputs / Fields

- **Style:** White field, 2px blueprint-gray stroke, dark ink, vermilion caret, and signboard corners (`12px 12px 4px 4px`).
- **Focus:** Stroke shifts to bright cobalt while the shared 3px marigold focus outline remains visible.
- **Error / Disabled:** Errors use a pale vermilion field with a darker red border and text. Disabled actions retain readable copy and reduce opacity.

### Navigation

Desktop pages use a painted brand band and quiet textual links; the working studio uses an architectural header and rail. At 900px and below, the slot rail becomes horizontal. At 640px and below, ordinary pages gain a fixed four-item paper navigation board with a cobalt active cell and marigold underline. Active destinations remain explicit in text and color.

### Arched Artwork Stage

The artwork stage is the visual signature: cobalt or vermilion structural paint, a 3px marigold edge, a warm inset line, and the exact unchanged artwork inside a clipped arch. Registration ticks make the frame feel fitted and intentional. The stage may enter once with a 780–900ms center-opening reveal; subsequent Variant changes appear immediately and exactly aligned.

### Variant Tile

Each tile is a paper material sample with a square preview, concise name, and optional review label. Hover raises it 2px and brightens the paper. Selection replaces the 1px tan border with a 3px vermilion border and adds a leaf-green check without changing the fitted artwork itself.

## Do's and Don'ts

### Do:

- **Do** let real reviewed Base Murti artwork carry the focal weight inside the ceremonial arch.
- **Do** use cobalt as architecture, paper as a work surface, and saturated accents as clear signals.
- **Do** keep selected, focused, pending, successful, disabled, and error states explicit in both copy and form.
- **Do** preserve generous touch targets, visible focus, reduced-motion behavior, and correct Devanagari rendering.
- **Do** make responsive layouts reorder around the artwork while preserving its exact proportions and fitted layers.

### Don't:

- **Don't** redraw, filter, restyle, or visually compete with the deity artwork.
- **Don't** drift into cream-and-gold luxury shrine styling, all-black luxury, glassmorphism, or ornate temple chrome.
- **Don't** spread marigold, green, or rose decoratively until their interaction meanings become ambiguous.
- **Don't** use pill-shaped controls or identical floating rounded cards as the default component language.
- **Don't** animate every change; keep the singular stage reveal and make working feedback immediate.

## Web release refinement · 2026-09-05

The homepage preserves the painted atelier identity while simplifying its supporting marks: one filled primary action, a quieter outlined video action, smaller mobile display lettering, and plain local-storage copy. Decorative sample swatches and preview numbering are removed so they do not compete with the Base Murti. Existing reduced-motion, touch feedback and immediate Variant selection remain.
