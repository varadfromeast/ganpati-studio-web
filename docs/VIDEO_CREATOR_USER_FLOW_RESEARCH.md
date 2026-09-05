# Video creator user-flow research: minimum-action variation

Date: 2026-09-01
Scope: a third, radically different iPhone flow optimized for the fewest screens and decisions. This document does not propose implementation code.

## Finding

The current experience does not merely hide the video action. It puts a different paid/AI task in front of it:

1. **Complete design** freezes the local recipe and opens `StillGenerationSheet` (`EditorScreen.swift`, lines 223–229 and 790–795).
2. The sheet's initial primary action is **Generate enhanced still** (`StillGenerationSheet.swift`, lines 93–103).
3. **Create personalized video** appears only after generation, fidelity review, approval, and saving (`StillGenerationSheet.swift`, lines 113–137).

This explains the reported “a screen pops up and that's it” behavior. Someone who finished a Murti reasonably expects the next primary action to use that Murti in a video, but instead enters a still-image workflow with no visible video route. The local deterministic export is already shown as the “exact customisation” (`StillGenerationSheet.swift`, lines 73–78), so an enhanced still should be an optional source choice, not a mandatory gate.

## First-party guidance that matters

- Apple’s current design principles recommend getting people directly to the task or content at hand, keeping them informed, and making recovery easy. This supports opening on the main creation task instead of making people choose between app departments before they can act. [Apple HIG: Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)
- A button’s primary role belongs to the action people are most likely to choose, and labels should clearly communicate the action. The finished-Murti primary action should therefore say **Use in video**, not lead indirectly through “final artwork.” [Apple HIG: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
- A sheet is for a brief, scoped task related to the current context and can collect the information required to finish an action. One video-composer sheet is appropriate after selecting or finishing a Murti; a chain of still-generation sheet → fidelity sheet state → video sheet is not the brief scoped interaction people expect. [Apple HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- Apple recommends giving essential information sufficient space, grouping related controls, and using progressive disclosure for secondary content. The artwork, blessing, cost, and create action should be visible; recipient, occasion, privacy detail, and credit packs can appear only when relevant. [Apple HIG: Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- Apple advises prefilling reasonable defaults to reduce decisions and speed entry. It also says required data must be clear and the forward action should become available only when required input is present. A safe editable blessing can be prefilled, while inline validation controls whether creation is enabled. [Apple HIG: Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data)
- A text field is intended for a short, specific value; a larger amount of text belongs in a text view. Placeholder text disappears while typing, so the message needs a persistent visible label. [Apple HIG: Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
- Apple’s writing guidance recommends clear field labels and actionable inline errors adjacent to the field. This supports **Your blessing** plus a live count and an inline “Shorten by 12 characters,” not a generic alert after submission. [Apple HIG: Writing](https://developer.apple.com/design/human-interface-guidelines/writing)
- Indeterminate progress is appropriate when duration cannot be quantified, but it should remain visibly active and the description must be accurate. Apple also recommends letting people do other things while waiting. An accepted video should immediately become a persistent item under **Videos**, and the composer can close safely. [Apple HIG: Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators), [Apple HIG: Loading](https://developer.apple.com/design/human-interface-guidelines/loading)
- Alerts are intentionally interruptive and should be reserved for critical, actionable information such as confirming a purchase. Routine validation, status, and “video started” feedback belong inline. [Apple HIG: Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts)
- A tab bar is for stable top-level destinations, not actions, and fewer destinations are easier to navigate. If the product needs persistent navigation, **Create** and **Videos** are enough; “Create Murti” and “Create Video” do not need to become separate app sections. [Apple HIG: Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)
- If importing an outside image is added later, Apple’s system Photos picker can filter to images, validates selected input, works out of process, and does not require blanket Photo Library permission. It should be a secondary source action, not a permission gate at launch. [Apple: Selecting Photos and Videos in iOS](https://developer.apple.com/documentation/PhotoKit/selecting-photos-and-videos-in-ios)

## Variation C: the Quick Blessing composer

Remove the main menu as a decision screen. Open directly into one stable **Create** tab and keep **Videos** as the only peer tab. The Create tab is already the complete video composer, using either the last Murti or a bundled Bal Ganesha default.

```text
Launch
  ↓
Create tab: Murti preview + Your blessing + Create button
  ├─ Create 6-second video · 1 credit
  └─ Customize Bappa → Murti editor → Use in video → same Create tab

Videos tab: creating, ready, failed, share
```

There is one video composer regardless of entry point:

- Direct path: the default or last-used Bal Ganesha is already selected.
- Custom path: **Customize Bappa** opens the existing Murti editor; **Use in video** returns its frozen deterministic render to the same composer.
- Existing-design path: **Change design** opens a compact source chooser containing **Last design**, **Saved designs**, and **Customize a new Bappa**.
- Enhanced still: **Enhance artwork** remains an optional secondary action from the source chooser. It never blocks video creation from the exact local render.

### Minimum common path

With a default blessing and available credit, the direct path is one commitment action:

1. Review the already-visible Murti and blessing.
2. Tap **Create 6-second video · 1 credit**.

Editing the blessing is not a navigation step; it happens in place. Customization adds one excursion, then returns to the same composer without creating a second review hierarchy.

### Screen anatomy and exact copy

Top to bottom:

1. Large portrait Murti preview.
   - Source badge: **Bal Ganesha · exact design**
   - Secondary text button: **Change design**
   - Secondary button: **Customize Bappa**
2. A visually generous blessing card directly below the image, not overlaid on detailed artwork.
   - Heading: **Your blessing**
   - Supporting copy: **This message appears in the finished video.**
   - Multiline `TextEditor`, approximately three to five lines at standard Dynamic Type.
   - Prefill: **May Bal Ganesha fill your home with joy and peace.**
   - Trailing live count: **54 / 240**
   - Optional suggestion chips: **Joy & peace**, **New beginnings**, **Ganesh Chaturthi**. Tapping one replaces or inserts an editable suggestion; it never submits.
3. One compact row: **Language** with English / हिन्दी / मराठी.
4. Disclosure control: **Personalize more**.
   - Reveals **Recipient name** and **Occasion**, both optional.
5. Compact promise row: **6 sec · portrait · gentle devotional ambience**.
6. Sticky primary action: **Create 6-second video · 1 credit**.
   - Immediately below: **2 credits available**.

Avoid putting the input text directly on top of the Murti. Apple notes that overlaid text can reduce both image clarity and text legibility; a separate blessing card gives the personalized message visual importance and a stable Dynamic Type layout. [Apple HIG: Image views](https://developer.apple.com/design/human-interface-guidelines/image-views)

### Arrival from the Murti editor

Change the semantic handoff, not merely the label:

- Editor primary CTA: **Use in video**
- Editor secondary CTA: **Save design**
- Optional tertiary action: **Export image**

Tapping **Use in video** freezes and renders the exact local design, dismisses the editor, and replaces the composer’s selected source. The person immediately sees their Murti above **Your blessing**. There is no mandatory enhanced-still generation or fidelity checklist.

### Creation, progress, and completion

After the paid commitment:

- Replace the CTA with **Video started · Safe to leave** and create the persistent Videos item immediately.
- Show truthful indeterminate activity with **Creating your video…** when the backend has no measurable percentage.
- Keep **View in Videos** and **Keep creating** available instead of trapping someone in the progress screen.
- On completion, the Videos item exposes **Play**, **Share**, and **Create another**.
- Recoverable interruption uses **Resume same video · no extra credit**. A new paid attempt alone uses **Create again · 1 credit**.

## Complexity deliberately hidden behind this simple surface

The one-screen appearance must not collapse the domain boundaries. A single journey/coordinator should hide:

- resolving the source as bundled default, last design, saved recipe, or optional enhanced still;
- deterministic high-resolution rendering and immutable artwork digest creation;
- draft autosave for source, blessing, language, recipient, and occasion;
- Unicode normalization and the existing backend-aligned length validation;
- policy checks without exposing a prompt console;
- authentication, credit lookup, purchase delivery, reservation, and compensation;
- one idempotency key for one accepted generation attempt;
- durable upload, queueing, polling/reconciliation, download, checksum, and MP4 validation;
- restoring an accepted job in Videos after dismissal or app termination.

The important implementation seam is therefore not “Murti creator versus video creator.” It is one `VideoDraft` containing an immutable `ArtworkSource` plus personalization, handed to one durable `DevotionalMovieJourney`.

## Tradeoffs

### Advantages

- Lowest time-to-first-video and no dead-end sheet.
- Direct and custom creation converge on one composer, so copy, validation, credits, and recovery cannot drift between entrances.
- Personalized text is a first-class object rather than a small field discovered late in a review funnel.
- A default makes the app immediately understandable: artwork + blessing → video.
- Existing local deterministic artwork becomes a valid source, avoiding an unnecessary paid still-generation dependency.

### Costs and risks

- Opening directly in a video composer makes the product feel video-first and may understate the craft of dressing the Murti.
- Defaults increase conversion but can produce repetitive videos unless the app clearly exposes **Customize Bappa**.
- A one-screen composer can become crowded. Recipient, occasion, purchase packs, privacy detail, and source provenance must stay progressively disclosed.
- The app must autosave the draft because the composer is now a durable workspace rather than a disposable sheet.
- A bundled default needs a clear provenance/version contract so a resumed draft always resolves to the same pixels.
- Optional external photo import expands safety, rights, aspect-ratio, crop, and fidelity policy. Keep it out of the first release unless it is a validated product requirement.

## Recommendation for selection

Choose this variation if the primary business/product goal is **the simplest possible path from opening the app to a personalized devotional video**. Do not choose it if the defining product value is the deliberate Murti-dressing ritual and the video is only a celebratory reward at its end; a creation-first flow will communicate that hierarchy better.

Regardless of the selected top-level variation, make one correction: **Complete design must offer a direct video handoff from the exact deterministic render. Enhanced-still generation must be optional.**
