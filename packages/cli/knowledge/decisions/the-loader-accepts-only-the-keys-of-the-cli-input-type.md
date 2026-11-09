---
type: decision
title: The loader accepts only the keys of the CLI input type
description: pikku.config.json is checked key by key against PikkuCLIInput; an unknown or moved key is refused naming its new home; environments name backends and frontends
tags: cli, config, environments, loader
---

# The loader accepts only the keys of the CLI input type

`assertKnownConfigKeys` (`src/utils/config-keys.ts`) walks `pikku.config.json`
against a shape that mirrors `PikkuCLIInput` (`types/config.d.ts`) and refuses
the first key it does not list, at the top level and inside every typed section.
A key that moved is refused naming its home (`dev` -> `backends.<name>.dev`,
`supportsImportAttributes` -> `schema`); a CLI flag that leaked in says which
flag; a `*File`/`*Dir` generated path says it is generated. Add a key to the
type and to that shape together.

- `outDir` is not a config key. The loader fixes it at `.pikku/` beside the
  config; `--outDir` stays an internal flag for per-unit codegen.
- `entrypoint`, `showcase`, `fabric` and `node` were read by nothing and are
  refused. `content` is per backend (`backends.<name>.content`): `pikku dev` and
  `pikku serve` read the served backend's block for the local content service
  (`resolveLocalContentConfig`, `backendForContent`). The top-level key is refused
  naming the new place.
- `addons` is not a top-level collection yet; `addon` and `registry` stay.

## environments

`environments.<name>` is `{ backends: { <backend>: url | { url, signInPath,
sessionPath, rpcPath } }, frontends: { <frontend>: url }, production }`, one
`PikkuEnvironment` type (`types/config.d.ts`). Auth paths belong to the backend
entry. A backend entry with no `url` takes `http://localhost:<dev.port>`.
`normalizeEnvironments` expands and checks it at load, so every reader sees the
expanded shape.

A run drives one backend of an environment: `--backend <name>`, else the only
one, and two or more with none named is an error (`pickEnvironmentBackend`).
`resolveEnvironment` returns the flat `ResolvedEnvironment` the runners use. The
fallback app URL is the only frontend, else the one marked `primary`.

## Rejected

- Keeping the flat `apiUrl`/`appUrl` entry beside the new one: an environment
  with two backends has no single `apiUrl`.
- Warning on unknown keys: a key that does nothing teaches the opposite of what
  the config means.
