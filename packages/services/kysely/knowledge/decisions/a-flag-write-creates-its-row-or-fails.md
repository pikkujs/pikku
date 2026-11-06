---
type: decision
title: A flag write creates its row or fails
description: setEnabled, setRollout and setOverride give a declared flag a row before writing, starting enabled, and refuse a name that is neither stored nor declared, so a kill switch never reports success having done nothing
tags: [feature-flags, kysely]
---

# A flag write creates its row or fails

A declared flag has no row until `syncFlags` runs, and an absent row means the
flag is on. An UPDATE on no rows succeeds, so turning a flag off before the
first sync used to report success and leave the feature running, and a misspelt
name did the same.

Each operator write now goes through `ensureRow`. A declared flag gets its row,
written with `enabled: true` because that is what the absent row already meant:
a rollout or an override set first narrows what is live and does not also darken
it. `setEnabled` then writes the value asked for. A name that is neither declared
nor stored is a `NotFoundError`. A stored row whose declaration has gone stays
writable, since those are still switchable until pruned.

`syncFlags` still adds new rows switched off. That is a dark launch asked for by
a deploy, whereas a write here is an operator acting on a flag that is live.
