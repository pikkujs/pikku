---
type: decision
title: An explicit libsql auth token wins over a token in the database URL
description: The libsql web dialect reads ?authToken= from the URL but uses config.authToken when both are set, and it talks to the HTTP pipeline with fetch rather than the Node client
tags: [kysely, libsql, credentials]
---

# An explicit libsql auth token wins over a token in the database URL

`LibsqlWebDriver`'s constructor in `packages/services/kysely-sqlite/src/libsql-web-dialect.ts`
takes the database URL and an optional `authToken` (`libsql-web-dialect.ts:36-39`,
`libsql-web-dialect.ts:87`).

Its comment says Turso puts the JWT in the URL as `?authToken=...`, and that an
explicit `config.authToken` should win (`libsql-web-dialect.ts:89-90`). The code does
both: it reads the URL token (`libsql-web-dialect.ts:93`), then sets the token to
`config.authToken ?? tokenFromUrl` (`libsql-web-dialect.ts:95`). The header is
`Bearer <token>` when a token exists (`libsql-web-dialect.ts:96`).

The endpoint is built from the URL with the `libsql:` scheme mapped to `https:`
(`libsql-web-dialect.ts:91-94`). The file's header comment says the dialect calls the
Turso HTTP pipeline directly with `fetch`, because the Node client's imports break
Cloudflare Workers (`libsql-web-dialect.ts:16-35`).

**What this rules out:** a token in the URL overriding one passed in config, and
depending on the Node libsql client for this dialect.
