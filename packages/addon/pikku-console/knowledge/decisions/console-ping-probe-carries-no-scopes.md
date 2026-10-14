---
type: decision
title: The console ping probe declares no scopes, so the UI learns whether the addon is wired
description: ping returns { pong: true } with no scopes; its comment says an unwired addon 404s while a wired one answers 200, 401 or 403, and that 401 and 403 both mean wired
tags: console, ping, probe
---

# The console ping probe declares no scopes, so the UI learns whether the addon is wired

`ping` (`packages/addon/pikku-console/src/functions/ping.function.ts:21-28`) is
declared with `title`, `description`, `expose: true` and a `func` that returns
`{ pong: true }`. It has no `scopes` key (`ping.function.ts:21-25`).

Its comment gives the reason. The console UI is a static bundle served at
`/console`, present whether or not the addon is wired, so the UI probes `ping` to
say "addon not enabled" rather than fail one request at a time
(`ping.function.ts:6-10`).

The probe reads a 404 as unwired. Name resolution runs before the session check,
so an unwired addon 404s even for an anonymous caller. A wired addon answers 200,
or 401 and 403 when the host gated it with `wireAddon({ auth: true })` or the
caller lacks a role (`ping.function.ts:12-16`). Every answer other than 404 means
wired, which is the only fact the screens need (`ping.function.ts:16`).

The comment also says the probe carries no scopes because narrowing who may learn
a fact the served UI already implies "would only turn a clear answer into a 403"
(`ping.function.ts:18-19`).

**What this rules out:** adding a scope to `ping`, and the UI reading a 401 or 403
from `ping` as "not wired".
