---
type: decision
title: The studio session holds the scope roots of wired addons and of the CMS, never the wildcard
description: Under pikku dev the studio session holds admin, pikku:otlp:runs and the root of each scope the functions of a wired addon require, read from runtime state when the session is set
tags: cli, studio, auth, addons, scopes
---

# The studio session holds the scope roots of wired addons and of the CMS, never the wildcard

**Why.** An addon's screens in Studio call the project as the studio session.
That session is not an app user, so no role grant reaches it, and without the
addon's scopes every call to a scoped addon function is a 403.

`studioSession` in
`packages/cli/src/functions/wirings/studio/register-studio-session.ts` adds the
root segment of each scope in the function metadata of every addon wired with
`wireAddon`. It is read when the session is set, so an addon wired or removed
while the dev server runs counts at once. A cloud workspace runs `pikku dev`, so
whoever reaches the workspace holds these roots there.

A root covers the whole tree under it. Where an addon requires a scope under a
root the app also uses, the session holds the app's scopes under that root too.

**CMS.** The session also holds `cms` when a function of the app requires a
scope under `cms`. Only the functions `pikku all` generates from `db/cms.ts` do:
the CLI refuses any other `cms` root. Studio's CMS screens need it, and `admin`
does not include it.

**What this rules out:** granting `*`; taking any other root from the app's own
functions, taking roots from a `wireRemoteAddon` addon, or from the `scopes` an app adds on
`wireAddon`, so those stay a 403 for the studio session unless a root above
already covers them; and this session anywhere but `pikku dev`.
