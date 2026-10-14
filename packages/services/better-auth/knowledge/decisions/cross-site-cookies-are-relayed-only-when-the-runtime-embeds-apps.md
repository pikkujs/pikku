---
type: decision
title: Cross-site cookies are relayed only when the runtime embeds apps
description: A third-party iframe needs SameSite=None cookies and, on WebKit, a JavaScript-held relay; both switch on only under AUTH_COOKIE_CROSS_SITE, so a deployed app keeps its Lax cookies and ignores the relay header
tags: better-auth, cookies, cross-site, security
---

# Cross-site cookies are relayed only when the runtime embeds apps

An app rendered inside a third-party iframe (the Fabric sandbox preview) gets its
`SameSite=Lax` cookies dropped. `AUTH_COOKIE_CROSS_SITE` (`cross-site-cookies.ts`)
turns that on, but only for an embedding host that sets it.

When it is on:

- Every better-auth `Set-Cookie` is rewritten to `SameSite=None; Secure;
  Partitioned` (`toCrossSite`). The auth handler also echoes the rewritten values
  in `x-pikku-cross-site-set-cookie`, as encoded JSON, so a client can keep them.
  Its response is marked `cache-control: no-store`.
- Incoming requests may carry the relayed pairs in `x-pikku-cross-site-cookie`.
  `mergeRelayedCookies` adds them to `Cookie`, and a real cookie of the same name
  wins. The relayed copy may be stale.

Why both: `Partitioned` is Chromium-only, and WebKit blocks third-party cookie
writes outright, which includes every browser on iOS. WebKit does allow
`localStorage` inside a third-party frame, so the client holds the relay there.

When it is off, neither the rewrite nor the relay happens. A deployed app ignores
the relay header, so "a session token can never be carried in JS-readable storage
outside the preview."

The file also explains why the better-auth `bearer()` plugin was not used: it
carries only `session_token`, while the stateless middleware reads `session_data`.

**What this rules out:** relaying session cookies outside an embedding runtime,
and making the relay header trusted by default.
