---
type: question
title: Should the OpenAPI document apply an ApiKey-or-Bearer security default to every operation, including auth false routes?
description: The OpenAPI serializer emits one top-level security default for all operations and does not read the auth or session metadata of any route
tags: [inspector, openapi, auth]
---

# Should the OpenAPI document apply an ApiKey-or-Bearer security default to every operation, including auth false routes?

`generateOpenAPISpec` in `packages/inspector/src/utils/serialize-openapi-json.ts` writes two security
schemes, `ApiKeyAuth` (an `x-api-key` header) and `BearerAuth`, unless the caller supplies its own
(lines 254-264). It then writes a top-level `security` array with one entry for each scheme
(lines 266-273), unless the caller supplies one.

In OpenAPI a top-level `security` applies to every operation that does not set its own. This file
does not write per-operation `security`, and a search of the file for `requiresSession` and
`sessionless` finds nothing. So an operation for a route marked `auth: false` would carry the same
default as one that requires a session.

Question: should `auth: false` routes and sessionless functions be written with an empty
`security` list, and should the default be applied per operation? The code does not say whether the
default is meant for the whole API or only as a placeholder.
