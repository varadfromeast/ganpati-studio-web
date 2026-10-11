# Project workflow

This repository contains the web app and its backend. Do not use an iPhone Simulator.

- Preserve both Base Murtis and every manifest-referenced runtime asset.
- Run web tests and a fresh production build after web changes; run backend tests after backend changes.
- Never commit secrets or local environment files. Keep example configuration free of credentials.
- Do not submit paid generation jobs merely for verification.
- Keep production enhanced still generation disabled until durable billing/idempotency controls exist.
- Prefer deep modules, explicit domain names, small interfaces, and shared state-machine rules across adapters.
