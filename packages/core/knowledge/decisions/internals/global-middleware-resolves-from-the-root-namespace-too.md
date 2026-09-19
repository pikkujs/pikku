---
type: decision
title: Global middleware resolves from the root namespace too
description: An addon's dispatch carries the addon's package name, so reading globals from that namespace alone meant the application's own global middleware never ran for it
tags: [middleware, addons, packages]
---

# Global middleware resolves from the root namespace too

`combineMiddleware` collects global middleware from `[null]` for a root
dispatch, and from `[null, packageName]` for a dispatch belonging to a package.

It previously read one namespace: whichever `packageName` the dispatch carried.
Application wirings carry `null`, so they were unaffected. A wiring contributed
by an addon carries that addon's package name, and the application's own globals
were not in that list — so an addon-contributed MCP tool ran with no session
middleware at all and refused every caller, while the same function reached over
HTTP authenticated normally.

Global middleware is application-wide by definition, and an addon's function
still runs inside the host application, so the root namespace always applies.
One addon's globals still do not reach another addon's dispatches.

The consequence is that a global written against the application's services now
runs where those services may not exist — an addon builds its own. Middleware
that reaches for a service it was not given has to stand down rather than throw;
see `a-session-middleware-stands-down-where-it-cannot-authenticate.md` in
`@pikku/better-auth`, which is where this first surfaced.

**What this rules out:** treating a package namespace as a middleware boundary
in both directions. It is a boundary for what an addon contributes, not a wall
that the host application's own policy stops at.
