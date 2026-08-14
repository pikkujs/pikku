---
'@pikku/openapi-parser': patch
'@pikku/better-auth': patch
'@pikku/assistant-ui': patch
'@pikku/ai-vercel': patch
'@pikku/console': patch
'@pikku/next': patch
'@pikku/kysely': patch
'@pikku/cli': patch
---

Declare dependencies that were imported but missing from `package.json`

`@pikku/openapi-parser` and `@pikku/better-auth` imported `zod`, `@pikku/next`
imported `path-to-regexp`, `@pikku/cli` imported `kysely`, and
`@pikku/assistant-ui` imported `rxjs`, none of which were declared. Each
resolved through Yarn hoisting inside the monorepo and would fail for anyone
installing the package on its own.

`rxjs`, `kysely` and `path-to-regexp` reach consumers through public
signatures — `Observable<BaseEvent>` is the return type of a published method,
and `createCoercionPlugin` returns a `KyselyPlugin` — so they are runtime
dependencies rather than build-only ones.

`@pikku/assistant-ui` pins `rxjs` to the exact `7.8.1` that `@ag-ui/client`
pins, rather than a caret range. The two packages exchange `Observable`s, so a
range that floats to a second copy gives them two incompatible `Observable`
types.

`@pikku/kysely` also drops `SqliteSerializePlugin`, an alias of
`SerializePlugin` that has been marked `@deprecated` in favour of it. Use
`SerializePlugin`.
