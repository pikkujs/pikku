---
type: decision
title: An addon SDK ships only the remote surface, and its version is checked against the last one
description: pikku sdk re-serializes the remote RPC map, exposed workflows and a pruned types map into six files, refuses any import outside the SDK and @pikku/core, and with --bump-from refuses a version below the surface-diff bump
tags: [cli, addon, sdk]
---

# An addon SDK ships only the remote surface, and its version is checked against the last one

`pikku sdk` (`functions/commands/sdk.ts`) writes `.pikku/sdk/` and packs
`<scope>-<name>-<version>.sdk.tgz` with exactly six files, all at the archive root:

- `manifest.json`
- `rpc/pikku-rpc-wirings-map.remote.gen.d.ts`
- `workflow/pikku-workflow-map.gen.d.ts`
- `agent/pikku-agent-map.gen.d.ts`
- `function/pikku-functions-meta.gen.json`
- `schemas/pikku-sdk-schemas.gen.json`

**The maps are re-serialized, not copied.** The addon's own generated maps
describe its whole app: every custom type is aliased into every map, and the
workflow map lists internal workflows. So `serializeSdkSources`
(`utils/addon-sdk-sources.ts`) serializes the maps again over `pruneTypesMap`. That
pruned map holds only the types reachable from:

- the `rpc.remoteMeta` functions, and
- the `expose: true` workflows.

Agents and graphs have no `expose`, so the SDK's agent map is always empty.
The function meta keeps `remote || expose` entries and stamps each one with a
`contractHash` (the inspector's `computeContractHash`, so it matches
`versions.pikku.json`, which covers remote functions too). Each entry also
carries `versions` — every version of its base name in the SDK — and
`latestVersion`, the one a consumer's bare `ns:fn` is sent to (see core's
[a remote call always names a version](../../../core/knowledge/decisions/internals/a-remote-call-always-names-a-version.md)).
`rpc.remoteMeta` lists `fn` and each remote `fn@vN`, so the remote map types
both. The schemas file holds the JSON schemas the entries name.

**Types only.** The shared custom-types file is inlined as the
`declare namespace __PikkuCustomTypes` that the map already reads. Each
relative import is re-pointed at its SDK sibling. Any other import is refused,
with a pointer to zod (PKU922). This covers a `src/` path and any package other
than `@pikku/core`.

**Version.** The version comes from `--version`, or else from `package.json`.
`--bump-from <tgz|dir|manifest.json>` diffs the previous SDK's meta against this
one with `surface-diff`, and refuses a version below
`bumpVersion(previous, verdict)`. With both SDKs' schemas, a contract changed in
place is classed as loosened (minor) or tightened (major); against an SDK cut
before schemas were packed, a moved hash counts as major. Adding `fn@v2` beside
`fn@v1` is minor, and dropping `fn@v1` is a removal, so major.

**What it rules out:**

- an SDK that leaks internal function or workflow types;
- an SDK that imports the addon's source;
- republishing a changed contract under a patch or minor bump.
