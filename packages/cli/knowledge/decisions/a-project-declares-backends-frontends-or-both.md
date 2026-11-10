---
type: decision
title: A project declares backends, frontends or both
description: backends and frontends are each optional in pikku.config.json; declaring neither is an error unless the project is an addon, and each command says what a zero-backend project does
tags: cli, config, backends, frontends
---

# A project declares backends, frontends or both

The loader (`assertBackendsDeclared`) refuses a non-addon config whose
`backends` and `frontends` are both absent or empty, naming both keys. An addon
declares neither and stays exempt. Checks that apply to backends (`dev.port` for
two or more, `publish`, content buckets, deploy shape) run only over the
backends that exist.

A frontend-only project builds no backend, so:

- `pikku all` runs the shared pass only: no `.pikku/backends/*`, no
  `.pikku/sdk/*`. `--backend x` fails as unknown, listing `(none)`.
- `pikku dev` runs only the frontends (`DevPlan` mode `frontends`): no
  codegen, no server, no proxy target.
- `pikku serve` errors "no backend to serve".
- `pikku deploy` plans and applies only the frontends; with none to deploy it
  says so and stops.
- `environments.<name>.backends` may be omitted; commands that call a backend
  (scenarios, virtual users) fail naming the environment.
- `clientFiles` glue imports a backend SDK, so declaring it with no backend is
  an error.

A frontend-only project can still import an SDK from the registry or another
project; Pikku generates nothing for it.

## Rejected

- Requiring a placeholder backend: it would build a server nobody runs.
