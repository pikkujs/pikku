---
'@pikku/cli': patch
---

Make the `build.sh` bootstrap resilient to a published `@pikku/cli` manifest
that carries an unconverted `workspace:*` dependency (e.g. `@pikku/cli@0.12.36`
shipped `@pikku/better-auth: workspace:*`, which npm cannot resolve and which
broke every downstream build that bootstraps the published CLI). The bootstrap
now installs its dependencies through a generated `package.json` with an
`overrides` entry that rewrites the offending spec to a real published version.
