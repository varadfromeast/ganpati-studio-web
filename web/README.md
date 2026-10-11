# Ganpati Studio Web

Responsive React/PWA translation of the existing SwiftUI product. It keeps the same product model: an immutable Base Murti, precisely fitted additive shringar layers, deterministic high-resolution export, local creations, and explicit enhanced-still/video handoffs.

## Local run

Use Node 24 LTS:

```sh
npm ci
npm run dev
```

Core design creation works without cloud configuration. Copy `.env.example` to `.env.local` only when testing the existing backend. Firebase web values are public identifiers; model/provider secrets must remain server-side.

```sh
cp .env.example .env.local
npm test
npm run build
npm run preview
```

The production bundle is written to `web/dist`. Runtime packs are sourced only from `assets/runtime-packs`; authoring references, goldens, and fit sources are never shipped. Home/picker art uses deterministic 600px WebP derivatives whose exact source, transform, and rights ledger are recorded in `public/previews/provenance.json` and embedded as XMP metadata.

## Browser feature map

- `/` — festival studio entry and durable pending-video recovery
- `/create/design` and `/create/video` — seated/dancing Base Murti choice
- `/studio/:pack` — Canvas compositor, fitted Variants, presets, undo/redo/reset, exact PNG export
- `/design/:id` — local result, Web Share/download, video handoff; enhanced still is safely feature-gated
- `/video/new` and `/videos/pending/:id` — authenticated, idempotent, resumable backend flow
- `/library` — IndexedDB-backed designs, videos, and pending work
- `/privacy` — web-specific local/cloud boundary and commerce disclosure

Browser storage is not a cloud backup and may be evicted. Finished work should be downloaded. Apple StoreKit is intentionally absent; web purchases remain disabled until a merchant and server-side fulfillment contract exist.

## Cheapest GCP deployment

The chosen stack is Firebase Hosting classic on Blaze plus the existing scale-to-zero Cloud Run backend in `asia-south1`. See `docs/gcp-hosting-research.md` for the sourced cost model and `docs/WEB_LAUNCH_RUNBOOK.md` for the release sequence.

Build before any Hosting deploy:

```sh
npm --prefix web ci
npm --prefix web test
npm --prefix web run build
npx firebase-tools hosting:channel:deploy prelaunch --project PROJECT_ID
```

Both runtime packs carry product-owner technical, cultural, and rights approval and pass release-policy staging. Production is published with the configured Firebase Web App/App Check registration, exact CORS origins, and the verified deployment artifact.

Production: `https://project-d5db8f30-7db5-4b54-925.web.app`
