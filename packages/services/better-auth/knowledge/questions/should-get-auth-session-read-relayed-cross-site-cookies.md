---
type: question
title: Should getAuthSession read relayed cross-site cookies?
description: getAuthSession merges relayed cross-site cookies into the headers it reads, a public read path that the cross-site cookie decision never names
tags: [better-auth, cookies, cross-site, sessions]
---

# Should getAuthSession read relayed cross-site cookies?

`getAuthSession` in `packages/services/better-auth/src/auth-api.ts` copies the
caller's headers, runs `mergeRelayedCookies` on the copy, and then calls
`instance.api.getSession` with the result (`auth-api.ts:95-100`). The comment there
explains only the copy: the merge mutates its argument, and that argument belongs to
the caller (`auth-api.ts:95-96`).

`mergeRelayedCookies` returns the headers unchanged unless cross-site cookies are
enabled (`packages/services/better-auth/src/cross-site-cookies.ts:111-113`). When they
are enabled, it adds the relayed `x-pikku-cross-site-cookie` pairs to `Cookie`, and a
real cookie of the same name wins (`cross-site-cookies.ts:114-123`).

The decision note
`packages/services/better-auth/knowledge/decisions/cross-site-cookies-are-relayed-only-when-the-runtime-embeds-apps.md`
describes that relay for incoming requests (lines 20-22). It does not mention
`getAuthSession`.

Open: is it intended that this session read helper applies the relay in the same way
the middleware does? Neither the file nor the note says so.
