---
'@pikku/inspector': patch
'@pikku/cli': patch
---

Middleware instance ids are now allocated per group across the whole inspection, not per source file, and a build that would drop a global middleware registration fails instead of shipping.

The per-group index restarted at 0 for every file, so the second file to register against a group minted ids the first already owned and overwrote its entries in `middleware.instances` — `instanceIds` listed one key twice while `count` correctly said two. For `addGlobalMiddleware` that was not cosmetic. Global middleware belongs to no wire group, so the instance map is the only record that its module must be imported, and per-unit deploy codegen emits its side-effect imports from that map. An app file registering a global middleware was erased by the generated auth scaffold registering its own, the app's module was never imported, its registration never ran — and because auth commonly lives in global middleware, a deployed unit answered every authenticated route with a 401 against a clean build log.

The inspector now also records each `addGlobalMiddleware` file in `middleware.globalFiles`, a plain set that no key collision can corrupt; codegen emits the side-effect imports from it, generates the middleware file when global middleware is a project's only middleware, and asserts against the text it emitted that every such file is imported — naming the files if not, rather than letting the unit deploy without its auth gate.
