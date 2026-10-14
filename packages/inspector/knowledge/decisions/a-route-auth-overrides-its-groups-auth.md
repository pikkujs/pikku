---
type: decision
title: A route's own auth overrides its group's, and auth false on a route makes an inline function sessionless
description: The route's auth is used when it is true or false, the group's inherited value otherwise; a resolved false sets sessionless on an inline function
tags: [inspector, http, auth]
---

# A route's own auth overrides its group's, and auth false on a route makes an inline function sessionless

In `packages/inspector/src/add/add-http-route.ts`, the route's own `auth` is read first
(line 281). `resolvedAuth` takes that value when it is `true` or `false` (lines 282-284),
and otherwise takes `inheritedAuth` (line 285), which the caller passes in from the group.

The comment at lines 277-280 says the value is recorded on the meta so an audit can tell
whether a route is open without re-reading the source.

Lines 287-289 say that for inline functions, `sessionless` is set to `true` when auth is
disabled at the route or group level. The code sets it only when the inline function's
`sessionless` is still `undefined` and `resolvedAuth` is `false` (lines 290-298).

**What this rules out:** a route with `auth: true` inheriting `false` from its group. It also
rules out letting an inline function be marked sessionless while the route asks for auth.
