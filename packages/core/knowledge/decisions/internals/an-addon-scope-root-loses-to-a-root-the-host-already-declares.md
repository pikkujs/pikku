---
type: decision
title: An addon's scope root loses to a root the host app already declares
description: loadAddonFunctionsMeta merges addon scope trees by root name, first declaration wins, so an addon sharing a root with its host contributes nothing — silently
tags: services
---

# An addon's scope root loses to a root the host app already declares

`loadAddonFunctionsMeta`
(`packages/inspector/src/utils/load-addon-functions-meta.ts`) reads each wired
addon's `pikku-scopes-meta.gen.json` and pushes its entries into
`state.scopes.definitions`, skipping any whose root name is already present. The
host app's own declarations were inspected first, so the host always wins.

The skip is per **root**, not per node. An addon declaring `admin.console.*` in
an app that declares `admin` contributes none of it — not the root it shares,
and not the branch the app never declared. Nothing errors: the scopes simply do
not exist, so `ScopeId` never gains them, no role can be granted one, and every
addon function requiring one denies everybody. The failure surfaces as a
`MissingScopeError` against a scope that cannot be granted, which reads as a
permissions bug rather than a merge that dropped.

This is a different rule from
[scope roots may be co-declared by an addon and its host
app](scope-roots-may-be-co-declared-by-an-addon-and-its-host-app.md): that one
is about `flattenScopeDefinitions` deduping ids _within_ a build where both
declarations are present and identical. This one is about the addon's copy never
arriving. The consequence for addon authors is the same either way — own a root
outright, named for the package or vendor, and nest everything under it. It is
why `@pikku/addon-console` declares `pikku:console:*` rather than
`admin:console:*`.

**What this rules out:** shipping an addon whose scopes hang off a root a host
is likely to declare, and deep-merging the two trees here so both survive. A
merge would have to reconcile conflicting descriptions and display names for the
shared nodes, and would let an addon graft capabilities onto the host's `admin`
tree — where a role granting `admin` would pick them up without anyone having
asked for them.
