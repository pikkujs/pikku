---
type: decision
title: A route requires a session when any auth signal says so
description: Four places can demand a session for an HTTP route and they combine with OR; a scope gate counts as a session demand
tags: [inspector, auth, http]
---

# A route requires a session when any auth signal says so

`annotateHttpRouteAuth` in `packages/inspector/src/utils/annotate-http-route-auth.ts`
sets `route.requiresSession` to true when any one of these holds (lines 31-38):

- the function's `sessionless` is `false`, which is a `pikkuFunc`;
- the function's own `auth` is `true`;
- the function declares one or more `scopes`;
- the route's own `auth` is `true`;
- the route's package is in the set of packages gated by their addon.

The last signal comes from `packagesGatedByTheirAddon` (lines 44-53). It gates a
package when one of its `wireAddon` declarations has `auth === true` or a
non-empty `scopes` list.

The scope rule is argued in the file's own doc comment. Scopes are checked
against the session and fail closed, so an anonymous caller is rejected either
way. Not counting them "would mark a route open that nobody can reach anonymously"
(`annotateHttpRouteAuth`, lines 14-16).

**What this rules out:** reading a scope-gated route as open. It also rules out
letting one signal cancel another; the four places only add demands.
