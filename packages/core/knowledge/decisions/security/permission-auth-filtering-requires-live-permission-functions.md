---
type: decision
title: Auth filtering requires live permission functions, never their metadata
description: checkAuthPermissions collects pikkuAuth-branded predicates off the real config; passing metadata would let every gated tool through
tags: permissions
---

# Auth filtering requires live permission functions, never their metadata

`checkAuthPermissions` in `packages/core/src/permissions.ts` answers "may this
session see this function/agent at all", for listing and tool-filtering. It
collects only predicates branded `__pikkuAuth` — from the globals and from the
supplied group — and ignores data-dependent permissions, which cannot be
evaluated without request data at filter time. If no auth predicates exist at
all, the answer is `true`: nothing is gating visibility.

`funcPermissions` must therefore be the **live** `CorePermissionGroup` taken from
the function or agent config, not the metadata form. The `__pikkuAuth` brand only
survives on the actual predicate objects, and the by-name registry that metadata
entries would resolve against is never populated. Passing metadata compiles
cleanly, collects nothing, hits the `authPerms.length === 0` branch and returns
`true` — every gated tool becomes visible to every session, silently and with no
error anywhere.

Note also that the collected predicates are ORed: any one passing auth predicate
grants visibility. This is a visibility filter only; `runPermissions` still runs
the full gate on invocation.

**What this rules out:** feeding this function anything derived from function
metadata or a serialized permission description, and treating a `true` result as
authorization to invoke rather than permission to list.
