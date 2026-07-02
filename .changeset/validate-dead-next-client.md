---
'@pikku/cli': patch
---

`pikku fabric validate`: flag the deprecated Next.js pikku client. Codegen no
longer emits `nextHTTPFile`/`nextBackendFile` (`nextjs-http.gen` /
`nextjs-backend.gen`), but a frontend left over from a Next→TanStack migration
still imports it. That file is gitignored (so `git add -A` never pushes it) AND
`pikku all` never regenerates it — so it lingers on the dev's disk (validate/tsc
pass locally) yet is absent in the clean build container, where tsc dies with
"Cannot find module './nextjs-http.gen'" and aborts the deploy. Validate now
errors on both the dead config keys and any surviving `nextjs-*.gen` import,
pointing at the fetch client (`PikkuFetch`/`PikkuRPC` + `createPikku`) generated
into the functions-sdk.
