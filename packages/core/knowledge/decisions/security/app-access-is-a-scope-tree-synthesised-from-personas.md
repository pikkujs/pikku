---
type: decision
title: App access is a scope tree synthesised from the personas that name an app
description: buildAppScopeDefinition creates one app:<name> scope per app any persona names, so which frontend a person may sign into is a runtime-revocable grant rather than a column per app
tags: core, personas, scopes, access
---

# App access is a scope tree synthesised from the personas that name an app

`packages/core/src/wirings/persona/persona-app-scopes.ts` builds an `app` scope
tree from the personas. `declaredApps` returns the app names used by personas,
sorted and without duplicates (`persona-app-scopes.ts:23-30`).
`buildAppScopeDefinition` creates one child scope per app, with the origin
`generated` (`persona-app-scopes.ts:60-74`). It returns `null` when no persona
names an app (`persona-app-scopes.ts:55-58`).

The doc comment gives the reasons. Which frontend a person may use is the same
kind of question as a scope: an admin can grant and revoke it at runtime, it
resolves at the session boundary, and a restricted API key can decline to inherit
it (`persona-app-scopes.ts:35-41`). The tree is synthesised, not written by hand,
because a hand-written copy could drift from the personas. The comment says that
failure "is one `pikku scopes prune` away from silently revoking sign-in"
(`persona-app-scopes.ts:45-47`).

**What this rules out:** a separate per-app access column, and a hand-maintained
list of apps that has to match the personas.
