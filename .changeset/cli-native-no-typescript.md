---
'@pikku/cli': patch
'@pikku/inspector': patch
---

The CLI no longer loads the TypeScript compiler under the native inspector. `@pikku/inspector/state` is a new compiler-free entry with everything a consumer of an `InspectorState` needs; the TypeScript engine, its source helpers, `@pikku/code-edit` and `@pikku/n8n-import` are now imported only when used. The CLI process peaks about 60 MB lower on a native build.
