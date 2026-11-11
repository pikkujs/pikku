---
type: decision
title: A backend generates an exposed SDK and a remote SDK
description: Each declared backend gets .pikku/sdk/<backend>/exposed/ and, when it has remote functions, remote/; generated-client paths are not configurable
tags: cli, codegen, backends, sdk
---

# A backend generates an exposed SDK and a remote SDK

Tiers: `expose: true` is exposed, `remote: true` is remote, the rest is internal.
Each backend's pass cuts from its own filtered `exposedMeta` and `remoteMeta`, so
two backends sharing a function can expose it differently.

- `.pikku/sdk/<backend>/exposed/` holds the clients and, under `contract/`, the
  typed maps they import.
- `.pikku/sdk/<backend>/remote/` is a types-only contract in the shape of an
  addon SDK, built with the same `buildSdkFiles` and `serializeSdkSources`, and
  present only when the backend has remote functions.

## Why the pass writes into its own directory

The backend pass runs as a child with a write guard that skips any file outside
its output directory (the internal `--outDir` flag). It therefore writes `<out>/sdk/`, and the parent moves that to
`.pikku/sdk/<backend>/`, re-pointing relative imports (`relocateExposed` in
`src/utils/backend-sdk.ts`). Files the pass reaches by relative import land under
`exposed/contract/`; imports of project source keep their target.

## Rejected

- Config paths for generated clients (`clientFiles.fetchFile` and the rest): two
  backends cannot share one path. The loader refuses them and names the new home.
- Publishing from the shared pass: the remote contract depends on the backend's
  filter, so only the backend pass has it.

## Publish

`backends.<name>.publish: true` packs `remote/` beside package.json as
`<package>-<backend>-<version>.sdk.tgz`. Default false. It refuses a backend with
no remote functions, a non-semver version, or no `@pikku/core` range. Without
`publish`, a remote contract that cannot be cut (a non-zod type) is a warning and
the exposed SDK is unaffected.

## Frontend glue

`rpcFile`, `nextBackendFile` and `tanstackStartFile` import one backend's SDK, so
a project that sets them declares exactly one backend. Choosing a backend per
frontend is later work.
