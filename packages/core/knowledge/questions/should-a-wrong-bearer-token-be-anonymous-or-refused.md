---
type: question
title: Should a Bearer token that does not verify be anonymous or refused?
description: authBearer refuses a malformed scheme with InvalidSessionError but lets a well-formed wrong token through as anonymous, and no comment says why
tags: core, auth, middleware
---

# Should a Bearer token that does not verify be anonymous or refused?

In `authBearer` (`packages/core/src/middleware/auth-bearer.ts`) the code splits
the header into scheme and token. A scheme other than `Bearer`, or an empty
token, throws `InvalidSessionError`. A `Bearer` token that then fails the static
constant-time compare, or decodes to nothing, does not throw. It calls `next()`
with no session, and the function gate decides what happens next.

Tests back both halves: "should throw InvalidSessionError when scheme is not
Bearer" and "should not set session when static token does not match". Neither
says why a malformed header is refused while a wrong credential is anonymous.

The JWT branch is different. When no static token is configured and a `jwtService`
is wired, `authBearer` calls `jwtService.decode(bearerToken)` with no try/catch
(`auth-bearer.ts`, around line 72). Core ships only the `JWTService` interface
(`packages/core/src/services/jwt-service.ts`). The implementation in this repo is
`JoseJWTService` (`packages/services/jose/src/jose-jwt-service.ts`). Its `decode`
calls `jose.jwtVerify` with HS256 only, so a bad signature or an expired token
throws, and so does an unknown key id (`Missing secret for id`). A token with no
key id is verified against the current secret. Because `authBearer` does not
catch that throw, with this implementation a bad JWT is a request error, not an
anonymous request. Other `JWTService` implementations are not in this repo, so
they are not covered by this.

What is asked: is an unverifiable Bearer token meant to be treated as no session,
so that a public function still answers it, or should it be refused at the
middleware the way a malformed header is? The two cases differ only in the
credential being well-formed, and the code makes no stated choice about it.
