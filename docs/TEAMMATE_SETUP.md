# Teammate setup

Clone https://github.com/varadfromeast/ganpati-studio-web and use Node.js 24 or newer.

```sh
git clone https://github.com/varadfromeast/ganpati-studio-web.git
cd ganpati-studio-web
npm --prefix web ci
npm --prefix backend ci
npm --prefix backend test
npm --prefix web test
npm --prefix web run build
npm --prefix web run preview
```

Both shipping Base Murtis and their runtime artwork are included. No native app or simulator is
needed. Local design and export work without credentials.

For the existing cloud video flow, obtain `web.env.local` privately from the owner and copy it
to `web/.env.local` before building. These are Firebase browser identifiers and the backend URL,
not model credentials. Firebase authorized domains, App Check, and backend CORS must permit the
chosen host; a local host is not automatically authorized for production access.

For backend administration, obtain GCP project access from the owner and authenticate with your
own account. Production uses service identity and Secret Manager. The separately supplied
`backend.secrets.env` contains provider credentials; keep it outside the repository and never
copy any of it into a `VITE_` variable. It is not a complete cloud deployment configuration.
Use `backend/infra/staging.env.example` and the infrastructure README for service settings.
Never commit a service-account key, Terraform state, or local environment file.

The owner supplies private configuration separately. This repository contains no credential
bundle. See `SPEAKING_VIDEO_FLOW.md` for the current native-audio video flow and its verification.
