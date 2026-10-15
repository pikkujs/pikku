---
type: decision
title: An addon header can only narrow the session, and an unknown addon is refused
description: addon-scope-cap intersects the session's scopes with the named addon's role, so naming an addon never widens access, and a name the host does not know is a 403
tags: core, middleware, scopes, addons
---

# An addon header can only narrow the session, and an unknown addon is refused

`packages/core/src/middleware/addon-scope-cap.ts` reads the `x-pikku-addon`
header (`addon-scope-cap.ts:8`, `31`). When a session is present, it resolves
the addon's role and replaces the session's scopes with
`intersectScopes(session.scopes, role)` (`addon-scope-cap.ts:37-45`).

The doc comment says the header "is a selector, not a credential: naming an
addon can only reduce a session" (`addon-scope-cap.ts:16-17`). An addon the host
does not know throws `ForbiddenError` (`addon-scope-cap.ts:38-40`), because the
comment says ignoring it "would let a misspelt name run uncapped"
(`addon-scope-cap.ts:18-19`).

With no header, or no session, the middleware calls `next()` and changes
nothing (`addon-scope-cap.ts:33-34`). The comment says to register it after the
session middleware (`addon-scope-cap.ts:21-22`).

**What this rules out:** using the header to gain scopes, and treating an
unrecognised addon name as "no cap".
