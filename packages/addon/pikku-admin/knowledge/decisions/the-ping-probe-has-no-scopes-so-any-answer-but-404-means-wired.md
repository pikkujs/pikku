---
type: decision
title: The ping probe has no scopes, so any answer other than 404 means wired
description: The admin ping function is exposed without a scope key so that a narrowed grant cannot turn its answer into a 403, and the console reads 401 or 403 as installed
tags: admin, ping, probes
---

# The ping probe has no scopes, so any answer other than 404 means wired

`packages/addon/pikku-admin/src/functions/ping.function.ts` returns `{ pong: true }`
(`ping.function.ts:20-27`). It is declared `expose: true` and has no `scopes` key
(`ping.function.ts:24`).

The comment above it (`ping.function.ts:3-19`) gives the reason. The console probes
this function to tell "addon not wired" from a real failure. Name resolution runs
before the session check, so an unwired addon answers 404 even for an anonymous
caller. A wired one answers 200, or 401 or 403 when the host gated it with
`wireAddon({ auth: true })` or the caller lacks a role (`ping.function.ts:11-15`).
Every answer other than 404 counts as wired.

The comment also explains the missing scope (`ping.function.ts:17-18`): narrowing
who may learn a fact the served UI already implies would turn a clear answer into a
403.

**What this rules out:** adding a scope to the probe, and reading 401 or 403 as
"addon not installed."
