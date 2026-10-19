---
type: decision
title: An addon SDK ships only the remote surface, and pikku all packs it on every run
description: For an addon, pikku all re-serializes the remote RPC map, exposed workflows and a pruned types map into five files, refuses any import outside the SDK and @pikku/core, and packs them at the package.json version; pikku versions check, not the SDK step, gates a contract change
tags: [cli, addon, sdk]
---

# An addon SDK ships only the remote surface, and pikku all packs it on every run

For an addon (`"addon": true`), `pikku all` ends with the `pikkuAddonSdk` step
(`functions/wirings/addon-sdk/pikku-command-addon-sdk.ts`). It writes
`.pikku/sdk/` and packs `<scope>-<name>-<version>.sdk.tgz` beside package.json
with exactly five files, all at the archive root. An app gets neither, and
there is no separate command to remember:

- `manifest.json`
- `rpc/pikku-rpc-wirings-map.remote.gen.d.ts`
- `workflow/pikku-workflow-map.gen.d.ts`
- `agent/pikku-agent-map.gen.d.ts`
- `function/pikku-functions-meta.gen.json`

**The maps are re-serialized, not copied.** The addon's own generated maps
describe its whole app: every custom type is aliased into every map, and the
workflow map lists internal workflows. So `serializeSdkSources`
(`utils/addon-sdk-sources.ts`) serializes the maps again over `pruneTypesMap`. That
pruned map holds only the types reachable from:

- the `rpc.remoteMeta` functions, and
- the `expose: true` workflows.

Agents and graphs have no `expose`, so the SDK's agent map is always empty.
The function meta keeps exactly the functions the maps declare (the remote
RPCs and the exposed workflows' functions; an exposed-only RPC is refused to a
remote caller, so it stays out) and stamps each one with a
`contractHash` (the inspector's `computeContractHash`, so it matches
`versions.pikku.json`, which covers remote functions too). Each entry also
carries `versions` — every version of its base name in the SDK — and
`latestVersion`, the one a consumer's bare `ns:fn` is sent to (see core's
[a remote call always names a version](../../../core/knowledge/decisions/internals/a-remote-call-always-names-a-version.md)).
`rpc.remoteMeta` lists `fn` and each remote `fn@vN`, so the remote map types
both. Each entry also carries the JSON schemas it names (`inputSchema`,
`outputSchema`), so a consumer or registry can read the contract without the
addon. They live in the meta rather than a sixth file because the
registry's publish check accepts exactly these five paths.

**Types only.** The shared custom-types file is inlined as the
`declare namespace __PikkuCustomTypes` that the map already reads. Each
relative import is re-pointed at its SDK sibling. Any other import is refused,
with a pointer to zod (PKU922). This covers a `src/` path and any package other
than `@pikku/core`.

**Version.** The version is package.json's, and the step packs nothing (with a
warning) when it is not semver or when package.json names no `@pikku/core`. The
archive is deterministic (fixed mtime, mode and owner), so the same contract
packs to the same bytes and the registry's integrity tells a re-run from a
change.

**The bump is not this step's call.** `pikku versions check` covers
`remote: true` functions, so a remote contract changed without a new
`version` fails there, the same gate as every other function. An SDK step that
diffed against the previous SDK would be a second gate, with its own rules,
over the same contracts.

**What it rules out:**

- an SDK that leaks internal function or workflow types;
- an SDK that imports the addon's source;
- a second, SDK-only version gate beside `pikku versions check`;
- an addon build whose SDK is stale because a second command was skipped.
