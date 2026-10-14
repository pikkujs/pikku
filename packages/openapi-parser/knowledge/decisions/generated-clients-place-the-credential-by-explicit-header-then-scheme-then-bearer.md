---
type: decision
title: Generated clients place the credential by explicit header, then the apiKey scheme, then Bearer
description: codegen.ts picks the header that carries the caller's credential in a fixed order, and a delegated login also emits an upstream authenticate() file
tags: [openapi, codegen, auth]
---

# Generated clients place the credential by explicit header, then the apiKey scheme, then Bearer

`authHeaderLine` in `packages/openapi-parser/src/codegen.ts:1327-1358` returns the
statement that puts the caller's credential on a request. It chooses in this order:

1. No credential kind: no statement (`codegen.ts:1332`).
2. A `basic` credential with no token expression: a `Basic` header built from the
   username and password (`codegen.ts:1333-1341`).
3. An explicit `headerName` in the auth config: that header, with the value from
   `authHeaderValue` (`codegen.ts:1343-1346`).
4. An `apikey` or `secret` credential, when the spec has an `apiKey` security scheme
   that names a header or a query parameter. The header or query parameter from the
   scheme is used (`codegen.ts:1347-1356`).
5. Otherwise, `Authorization: Bearer <token>` (`codegen.ts:1358`).

The credential shapes the generated code accepts are in `CREDENTIAL_SHAPES`
(`codegen.ts:1319-1324`).

Delegated login is a separate output. When `flags.authConfig.delegated` is set,
codegen writes `src/<name>-upstream-auth.ts` (`codegen.ts:436-445`). The writer for
that file is `generateUpstreamAuthFile` (`codegen.ts:1110-1116`). It emits the apiKey
header on the login request when the credentials include `apiKey`
(`codegen.ts:1145-1148`). The email rule for delegated login is in the question note
`should-a-delegated-login-invent-an-email.md`.

**What this rules out:** sending an apiKey scheme's value as a Bearer token when the
scheme names a header or query parameter, and ignoring an explicit `headerName` in
the auth config in favour of the spec's scheme.
