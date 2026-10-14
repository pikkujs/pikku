---
type: question
title: Does the wirePersonaSignIn hook land, given the new direction?
description: The hook was reworked and pushed as commit 8d64af815 before the direction changed to OSS-only credentials; whether it stays in the PR is undecided
tags: services, auth
---

# Does the wirePersonaSignIn hook land, given the new direction?

Commit `8d64af815` on `spike/persona-signin-hook` (PR #2062) adds
`wirePersonaSignIn(factory)`, optional `headers`, and a precedence of wired, then
operator, then secret. It also adds an inspector visitor that records files
calling it, and removes `scenarios.signIn`.

The direction since then is: OSS must work without Fabric, personas need no
per-app sign-in factory, and local switching is a dev panel. Under that
direction the hook is not needed for personas, and its operator branch is the
Fabric layer.

Undecided: close #2062 with this recorded as the reason, or keep the hook for
the cases a key cannot cover. The CLI package does not type-check in that
checkout, and the wiring is not exercised end to end.
