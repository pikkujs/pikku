---
'@pikku/kysely-sqlite': patch
---

feat(kysely-sqlite): add `LibsqlWebDialect` for libsql/Turso over HTTP

A Kysely dialect that talks to libsql's HTTP `v2/pipeline` endpoint directly
with `fetch`, instead of going through `@libsql/client`.

Why this exists:
- `@libsql/kysely-libsql` imports `@libsql/client` (Node entry), which pulls
  in `node:http`. Cloudflare Workers' `nodejs_compat_v2` does not ship
  `node:http`, so the worker fails to upload with error 10021.
- `@libsql/client/web` imports both `./http.js` and `./ws.js` at module top,
  and `./ws.js` pulls in `ws`, which calls `require('node:events')` at load
  time. CF Workers also doesn't ship `node:events` — same 10021.
- `@libsql/client/http` re-uses `@libsql/hrana-client`'s index entry which
  imports `ws` transitively for the same reason.

`LibsqlWebDialect` avoids all of that by speaking the libsql HTTP pipeline
protocol directly: single endpoint, single round-trip per execute.
Transactions use the `baton` mechanism — every response returns a baton,
and resending it on the next request keeps the same server-side stream
(same SQL connection, same transaction).

```ts
import { Kysely } from 'kysely'
import { LibsqlWebDialect } from '@pikku/kysely-sqlite'

const db = new Kysely<DB>({
  dialect: new LibsqlWebDialect({
    url: env.LIBSQL_URL, // libsql://, https://, or http://
    authToken: env.LIBSQL_TOKEN,
  }),
})
```
