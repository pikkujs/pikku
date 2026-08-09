---
'@pikku/core': patch
---

Remove the `addTagPermission`, `addHTTPPermission` and `ZodLike` compatibility stubs

Tag- and HTTP-route-level permissions were removed in #972; `addTagPermission` and `addHTTPPermission` survived only as throwing stubs so the pinned bootstrap CLI could resolve their imports at build time. `@pikku/cli@0.12.96` — the currently pinned bootstrap version — emits neither name, so the stubs and the `packages/cli/build.sh` rewrite rules that fed them are gone.

Declare permissions on the function instead: `pikkuFunc({ permissions })`, or app-wide with `addGlobalPermission`.

`ZodLike` was an alias for `StandardSchemaV1<T, T>` kept for generated code that no longer references it. Import `StandardSchemaV1` from `@standard-schema/spec` directly.
