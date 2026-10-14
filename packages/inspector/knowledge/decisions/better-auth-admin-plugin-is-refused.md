---
type: decision
title: better-auth's admin plugin is refused in favour of pikkuBan
description: Wiring admin() in pikkuBetterAuth throws at build time, and the error names pikkuBan() as the replacement
tags: [inspector, auth, better-auth]
---

# better-auth's admin plugin is refused in favour of pikkuBan

In `packages/inspector/src/add/add-auth.ts`, a plugin named `admin` inside
`pikkuBetterAuth` throws rather than warning (lines 342-344). The error text is
`UNSUPPORTED_ADMIN_PLUGIN` (lines 174-190). It tells the app to use `pikkuBan()`.

The doc comment above the constant (lines 158-172) gives the reason. `admin()`
authorizes against a `user.role` column, and pikku authorizes on scopes. Running
both means projecting one onto the other, coarsely. The comment says user
management now lives in `@pikku/addon-admin`, and the ban refusal lives in
`pikkuBan()`.

The comment at lines 170-172 says the throw is deliberate: "the failure it prevents
is silent". An app that drops `admin()` without wiring `pikkuBan()` keeps its ban
columns and stops enforcing bans.

**What this rules out:** `admin()` as a second authorization model next to scopes.
