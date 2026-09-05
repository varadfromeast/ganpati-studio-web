# Ganpati Studio Web

Mobile-first Ganesh Chaturthi Design studio, with seated and dancing Base Murtis, fitted shringar, PNG export, local creations, offline reopening and a durable devotional-video backend.

Live app: https://project-d5db8f30-7db5-4b54-925.web.app

## Contents

- `web/`: React/TypeScript/Vite client, tests, PWA and deterministic runtime-asset staging.
- `backend/`: Node/Express backend, tests, Docker build and GCP infrastructure configuration.
- `assets/runtime-packs/`: both complete shipping Asset Packs.
- `assets/packs/`: authoring assets, review metadata and golden composites.
- `tools/`, `scripts/`: asset preparation and validation utilities; some historical tooling references the original native workspace.
- `docs/`: architecture, research and release runbooks.

The native iPhone app, local verification captures, build outputs and credentials are excluded. This repository starts with the current web release rather than copying unrelated native Git history.

## Local development

Use Node.js 24 or newer.

```sh
npm --prefix web ci
npm --prefix backend ci
npm --prefix web test
npm --prefix web run build
npm --prefix web run preview
```

Open http://localhost:4173. The production preview includes staged artwork. For Vite hot reload, first expose the runtime pack directory locally:

```sh
ln -s ../../assets/runtime-packs web/public/packs
npm --prefix web run dev
```

Remove that local symlink before a production build; production staging copies only manifest-approved files.

Cloud features require public Firebase web configuration in `web/.env.local`; copy `web/.env.example` and fill the values for your Firebase deployment. Provider secrets belong in Secret Manager and never in browser configuration. Local design/export works without cloud configuration.

```sh
npm --prefix backend test
```

See `docs/WEB_MODULES.md` for module responsibilities and `docs/WEB_LAUNCH_RUNBOOK.md` for deployment and verification. The runbook references local verification artifacts retained in the original workspace rather than committed here.

## Release controls

Production uses Firebase Hosting, Firebase Auth/App Check, Cloud Run, Cloud Tasks, Firestore and private GCS. Video generation is billable; routine verification must not submit paid jobs. Enhanced still generation and web checkout remain disabled. Existing GCP resources require Terraform state adoption before a broad apply.

## Artwork

Keep the Base Murti coordinate systems and fitted layer ordering intact. Asset provenance and release review records accompany the packs. Repository visibility does not grant a new license to redistribute artwork.
