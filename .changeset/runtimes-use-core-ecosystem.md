---
'@pikku/core': patch
'@pikku/lambda': patch
'@pikku/azure-functions': patch
'@pikku/bun-server': patch
'@pikku/cloudflare': patch
'@pikku/express-middleware': patch
'@pikku/express': patch
'@pikku/fastify-plugin': patch
'@pikku/fastify': patch
'@pikku/modelcontextprotocol': patch
'@pikku/next': patch
'@pikku/node-http-server': patch
'@pikku/tanstack-start': patch
'@pikku/uws-handler': patch
'@pikku/uws': patch
'@pikku/ws': patch
---

Runtime adapters reach core only through `@pikku/core/ecosystem/*`

`@pikku/core` exports the same modules through two doors: the curated
`ecosystem/*` facades, and 47 raw subpaths where `./http` maps straight to
`dist/wirings/http/index.js` — the whole internal barrel. The runtime adapters
used both, for the same modules: 26 imports via `ecosystem/http` against 22 via
`./http`, 8 via `ecosystem/channel` against 11 via `./channel`.
`pikku-express-middleware.ts` had both doors in four consecutive lines.

It could not be a rename, because the facades were curated as *type* facades.
Every dispatch entry point had stayed on the raw path and was missing from its
twin: `fetchData`, `fetch`, `PikkuFetchHTTPRequest`, `PikkuFetchHTTPResponse`,
`wireHTTP`, `runQueueJob`, `runScheduledTask`, `runLocalChannel`, `runMCPTool`,
`runMCPResource`, `runMCPPrompt`, `compileAllSchemas`, `addFunction`,
`addGlobalMiddleware`, `rpcService`, `PikkuWorkflowService`, and the local
service implementations an adapter constructs. An adapter cannot exist without
them, so they are now part of the ecosystem surface — the widening is visible in
`public-surface.json` and `api-report.md`.

`ecosystem/errors` and `ecosystem/channel/serverless` are new; they had no twin
at all. `ecosystem/types` picks up the six names adapters were taking from the
bare `@pikku/core` entry point.

All 136 raw specifiers across the 15 runtime packages now point at `ecosystem`,
and a new test in core fails if one drifts back, naming the file, line and
specifier. The raw subpaths are untouched and still exported — roughly 290 files
outside `packages/runtimes` still use them, so closing that door is a separate
breaking change.
