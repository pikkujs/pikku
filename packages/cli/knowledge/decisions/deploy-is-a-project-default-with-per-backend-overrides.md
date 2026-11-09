---
type: decision
title: Deploy is a project default with per-backend overrides
description: deploy sets provider and target for every backend and frontend; a unit overrides them; grouping and embed are per backend; no provider is an error
tags: cli, deploy, backends, config
---

# Deploy is a project default with per-backend overrides

`deploy` at the top level is the default for every unit. `backends.<name>.deploy`
and `frontends.<name>.deploy` override `provider` and `target`; the CLI `-p` beats
both. `resolveDeploy` (`src/deploy/resolve-deploy.ts`) is the one place that
merges them.

- `target` in a backend `filter` selects functions; `deploy.target` is how the
  unit is deployed. A function with no explicit target counts as the backend's
  resolved `deploy.target`, so the filter and the deploy agree.
- `grouping` and `embed` have no project default: they describe one backend's
  units and files.
- `serverlessIncompatible`, `bundler`, `mangleIdentifiers`, `db`, `cloud` and
  `release` stay project-level. `cloud` holds only `projectId`, a committed
  identifier; nothing secret is in config.
- `deploy.contributors` stays refused: contributors come from addons through
  `wireAddon`, so there is no per-backend contributors key.
- Plan and apply run per backend on that backend's filtered state, building into
  `.deploy` for one backend and `.deploy/<backend>` for several. A single-unit
  bundle imports its bootstrap from `.pikku/backends/<name>/`; db assets and
  contributor facts still come from the shared `.pikku/`.

## Rejected

- A fallback provider. A project that never named one has not chosen where it
  deploys, and silently picking cloudflare shipped to the wrong place.
- Keeping `defaultProvider` and `defaultTarget` beside the new names: the loader
  refuses them and names the new key.
