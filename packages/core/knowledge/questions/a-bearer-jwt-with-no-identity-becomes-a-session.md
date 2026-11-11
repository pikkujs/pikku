---
type: question
title: Does a bearer JWT with no identity claim count as a session?
description: The cookie middleware refuses an identity-less JWT, but authBearer sets whatever decode returns, so the two paths disagree
tags: core, auth, middleware
---

# Does a bearer JWT with no identity claim count as a session?

`authCookie` (`packages/core/src/middleware/auth-cookie.ts`) only sets a session
when `hasSessionIdentity` is true, meaning the decoded payload has a key that is
not a registered JWT claim. Its test comment says a JWT of an absent session
still decodes to a truthy `{ iat, exp }` that "the runner accepts", and it guards
against that.

`authBearer` (`packages/core/src/middleware/auth-bearer.ts`) has no such check.
In JWT mode it calls `jwtService.decode(bearerToken)` and calls `setInitialSession` on
any truthy result. Its test only covers a `null` decode.

What is asked: should a bearer token that decodes to `{ iat, exp }` alone be
treated as anonymous, as the cookie path does, or as an authenticated session?
Current behaviour: it becomes the request session. Whether a signed token of that
shape can be minted is not checked in core, because the `JWTService`
implementation is not in this package.
