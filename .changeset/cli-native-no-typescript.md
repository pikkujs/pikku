---
'@pikku/cli': patch
'@pikku/inspector': patch
---

The CLI no longer loads the TypeScript compiler under the native inspector. `@pikku/inspector/lite` also carries everything a consumer of an `InspectorState` needs (initial state, filtering, workflow deserializers, schema references), and the TypeScript engine and its source helpers load only once that engine is selected. The CLI process peaks about 60 MB lower on a native build.
