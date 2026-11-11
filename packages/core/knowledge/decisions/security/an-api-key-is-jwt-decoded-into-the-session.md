---
type: decision
title: An API key is JWT-decoded into the session, from a header or a query parameter
description: authAPIKey reads x-api-key or the apiKey query parameter, decodes it as a JWT, and sets the session only when no session exists yet
tags: core, auth, middleware, api-keys
---

# An API key is JWT-decoded into the session, from a header or a query parameter

`packages/core/src/middleware/auth-apikey.ts` takes an API key from the
`x-api-key` header, the `apiKey` query parameter, or both, depending on the
`source` option (`auth-apikey.ts:11-13`, `21-27`). The header is tried first;
the query is read only when no header value was found (`auth-apikey.ts:25`).

The key is decoded with `jwtService.decode` and, if that returns a value, passed
to `setInitialSession` (`auth-apikey.ts:29-33`). The middleware does nothing when a
session already exists (`auth-apikey.ts:17`), which the doc comment describes as
leaving "an existing session alone, so it composes with other auth middleware"
(`auth-apikey.ts:6-7`).

Nothing is decoded when no `jwtService` is wired (`auth-apikey.ts:29`).

**What this rules out:** an API key overriding a session that is already set,
and a key being accepted without a JWT service to verify it. The code also
accepts a key from the query string (`auth-apikey.ts:26`), so keys can appear in
URLs when `source` includes `query`.
