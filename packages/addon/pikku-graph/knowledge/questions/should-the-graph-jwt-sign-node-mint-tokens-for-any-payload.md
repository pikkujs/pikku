---
type: question
title: Should the graph JWT sign node mint tokens for any payload with no auth gate?
description: jwtSign is a sessionless function with no auth, scopes or expose setting, and it encodes any caller-supplied payload into a token; the code does not say whether that reach is intended
tags: graph, jwt, auth
---

# Should the graph JWT sign node mint tokens for any payload with no auth gate?

`jwtSign` (`packages/addon/pikku-graph/src/functions/data/jwt.function.ts:21-33`)
is declared with `pikkuSessionlessFunc` and a `node` block. Its configuration sets
`description`, `node`, `input`, `output` and `func`, and no `auth`, `scopes` or
`expose` key (`jwt.function.ts:21-25`).

Its input is any `payload` plus an `expiresIn` duration (`jwt.function.ts:5-15`).
The function passes both to `jwt.encode(expiresIn, payload)` and returns the token
(`jwt.function.ts:30-31`).

The core runner requires a session for a sessionless function only when the wiring
auth, the function's own `auth`, or the addon's auth is `true`
(`packages/core/src/function/function-runner.ts:385-392`). With none of those set,
no session is needed to call `jwtSign`.

The matching `jwtDecode` verifies the signature with `jose.jwtVerify`
(`packages/services/jose/src/jose-jwt-service.ts:74-76`), so the service accepts
the tokens this node produces as its own.

Open: which callers can reach a graph node that runs `jwtSign`, and is a signing
node meant to be available to them with no gate? This note did not read the
service's `encode` implementation or the routes that expose graph nodes.
