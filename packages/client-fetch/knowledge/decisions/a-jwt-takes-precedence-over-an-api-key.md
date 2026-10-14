---
type: decision
title: When both a JWT and an API key are set, the client sends only the Bearer JWT
description: getHeaders sends Authorization Bearer when a jwt is set and falls back to X-API-KEY only when there is no jwt
tags: [client-fetch, auth, headers]
---

# When both a JWT and an API key are set, the client sends only the Bearer JWT

`getHeaders` in `packages/client-fetch/src/core-pikku-fetch.ts` (lines 54-65) adds
`Authorization: Bearer <jwt>` when `authHeaders.jwt` is set (lines 59-60). It adds `X-API-KEY` only in
the `else if` branch, which runs when there is no `jwt` (lines 61-62).

The constructor copies `options.authHeaders` into `this.authHeaders` (line 46), so both values are read
from the same object.

**What this rules out:** sending both credentials on one request. A caller that sets both gets only the
JWT, and the API key is not sent at all.
