---
type: decision
title: Analytics identity is stamped from the session and resolvers, never from the event body
description: Each analytics record takes userId and orgId from the wire session, pikkuUserId from the wire, and the rest from the identity resolvers, not from the event payload
tags: core, analytics, security
---

# Analytics identity is stamped from the session and resolvers, never from the event body

`resolveEvent` in `packages/core/src/analytics/analytics.ts:55-72` builds
`userIdentity` from the wire session (`:59`, `:67-69`), `this.wire.pikkuUserId`
(`:70`), and the output of the identity resolver (`:61`, `:71`). The event's own
fields are `name`, `props` and the optional `at` (`:60`, `:66`). The identity
fields are not read from the event.

`packages/core/src/analytics/analytics.types.ts:26-29` gives the reason: identity
is stamped server-side and never read from the request body, which is what makes
an unauthenticated ingest safe to expose.

The consent notes in this folder cover the cookie side of identity. They do not
cover how the record's identity is attached.

**What this rules out:** a client supplying `userId`, `orgId` or `pikkuUserId` in
an analytics event and having it recorded as the caller's identity.
