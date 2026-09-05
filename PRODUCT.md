# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated by the product owner: a static TypeScript web client that can ship quickly and inexpensively on Google Cloud, while preserving the existing Node.js/Express Cloud Run backend and Firebase security model.

## Users

- People celebrating Ganesh Chaturthi who want to create and share a respectful, personalized Bappa artwork or devotional video from a phone or desktop browser. *(Inferred from the current product flows and festival deadline.)*
- The primary use scene is a short, visual, mobile-first creation session that may be resumed after an AI generation job finishes. *(Inferred from the editor, local library, and durable-job implementation.)*

## Product Purpose

Ganpati Studio lets a person choose a Base Murti, explore only fitted and compatible decorative Variants, save the resulting Design, enhance it, and optionally bring it to life as a personalized devotional video. Success means reaching a shareable result quickly without compromising the Base Murti, the user's exact selections, privacy, or devotional tone.

## Positioning

The product is a respectful digital shringar studio, not a generic character creator: every Design is composed from reviewed layers fitted to one immutable Base Murti coordinate system, and the same flattened artwork becomes the identity-preserving source for enhancement and video generation.

## Operating Context

- Visitors choose between the seated and dancing Base Murti libraries.
- They customize Crown, Garland, Outfit, Modak where supported, and Scene; undo, redo, reset, and curated randomization are part of the working loop.
- Designs persist locally, export as high-resolution PNGs, and can be downloaded or shared through browser-native capabilities.
- Enhanced still and devotional movie requests use the existing authenticated backend. Accepted video attempts remain resumable by stable idempotency key.
- Devotional messages support English, Hindi, and Marathi.

## Capabilities and Constraints

- Preserve the existing runtime Asset Pack manifests, coordinate system, z-order, fixed occluder layers, variant meanings, and Base Murti terminology.
- Preserve the existing Node.js/Express backend contracts for enhanced stills, devotional movies, polling, private signed downloads, Firebase authentication, Firebase App Check, Firestore, Cloud Tasks, and private Cloud Storage.
- Replace native-only behaviors with web equivalents: local persistence, Web Share with download fallback, canvas export, anonymous Firebase Auth, and browser App Check.
- Apple StoreKit purchases and App Attest are native-only. Web checkout is deliberately an open launch decision until a web payment provider and merchant account are approved; the web client must not imply that Apple purchases work in a browser.
- Production media generation remains credential-gated and billable. No provider key may enter browser code.
- The launch deadline is ten days from 2026-09-04, so the client must be static, independently deployable, and operational with the existing backend.

## Brand Commitments

- Product name: **Ganpati Studio**.
- Use the domain language in `CONTEXT.md`: Base Murti, Customization Slot, Variant, Design, and Asset Pack.
- The experience must be reverent, joyful, culturally careful, and visually exceptional; avoid novelty or disrespectful transformations.
- Existing reviewed artwork is authoritative. New interface art must frame it and must not redraw or alter the deity imagery.

## Evidence on Hand

- Product vocabulary and invariants: `CONTEXT.md`.
- Native workflows and copy: `GanpatiStudio/*.swift`.
- Runtime layered artwork and manifests: `assets/runtime-packs/`.
- Existing interface explorations: `assets/design/` and `design/concepts/`.
- Durable backend and deployment infrastructure: `backend/`.
- No approved testimonials, customer counts, conversion metrics, public pricing, merchant provider, or production domain are present; the web experience must not fabricate them.

## Product Principles

1. The Base Murti remains intact; customization is additive, fitted, and reversible.
2. Creation feels immediate locally; paid or slow generation is explicit, durable, and resumable.
3. Devotional meaning accompanies visual choice without turning worship into gamification.
4. Private by default, shared only by an intentional user action.
5. Festival-ready scope and operational simplicity outrank platform-specific ornamentation.

## Accessibility & Inclusion

The responsive web client must support keyboard use, visible focus, reduced motion, high-contrast text, meaningful image descriptions, touch targets suitable for mobile, and correct rendering of English, Hindi, and Marathi text. Decorative pattern work must stay hidden from assistive technology.
