---
type: decision
title: Verified bearer claims are pass-through data that core never fills
description: PikkuHTTP.authInfo is a typed slot for claims a host has already verified; core declares it and no core source assigns it from request headers
tags: core, http, auth
---

# Verified bearer claims are pass-through data that core never fills

The doc comment on `PikkuHTTPAuthInfo` in `packages/core/src/wirings/http/http.types.ts:67-74`
says the claims are strictly pass-through: nothing in pikku derives them from a
request's headers, because verifying a token is the host's job. The field carries
what the raw `Authorization` header cannot: the scopes and client the token was
issued for.

The interface is at `http.types.ts:79-88`, and `authInfo?: PikkuHTTPAuthInfo` is on
`PikkuHTTP` at `:94`. A search of `packages/core/src` finds only the type and its
re-export (`packages/core/src/wirings/http/index.ts:23`). The comment at `:76-77`
says the MCP SDK is the one caller that populates it, and that is outside this
package.

**What this rules out:** deriving `scopes`, `clientId` or `token` from the
`Authorization` header inside core.
