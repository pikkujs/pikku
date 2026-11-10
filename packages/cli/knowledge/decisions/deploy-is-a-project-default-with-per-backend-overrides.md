---
type: decision
title: Deploy is a project default with per-backend overrides
description: deploy sets provider and target for every backend and frontend; a unit overrides them; grouping and embed are per backend; standalone is the default provider
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
- A unit with no provider anywhere resolves to `standalone` with target
  `server`; `-p` still beats the override chain (unit `deploy`, then project
  `deploy.provider`). The default target is `server` only when no provider was
  named; a named provider with no target stays `serverless`.
- Frontends deploy through their resolved provider unless `deploy: false`.
  A provider declares `frontends: { kinds, embedded }`; plan and apply resolve
  every frontend provider up front and fail before any build when it lacks the
  frontend's `kind`. A `serve` frontend is embedded in its backend's bundle
  and uses that backend's provider, so an explicit differing provider is an
  error. A non-embedded frontend on a provider that lists kinds but has no
  `deployFrontend` fails with "declares support but does not implement".
  Real hosting for non-standalone providers is not built yet.
- Plan and apply run per backend on that backend's filtered state, building into
  `.deploy` for one backend and `.deploy/<backend>` for several. A single-unit
  bundle imports its bootstrap from `.pikku/backends/<name>/`; db assets and
  contributor facts still come from the shared `.pikku/`.

## Rejected

- Cloudflare as the fallback provider: it shipped to the wrong place. An
  earlier version of this decision made a missing provider an error; the
  default is now `standalone`, a self-hosted server that cannot surprise-bill.
- Keeping `defaultProvider` and `defaultTarget` beside the new names: the loader
  refuses them and names the new key.
