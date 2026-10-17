---
'@pikku/react': patch
---

`createLocaleStore` now reads `I18N_DEBUG` through `globalThis.process`, so the source compiles without Node type definitions. Packages that type-check `@pikku/react` from source, such as `@pikku/workflow-graph`, used to fail with TS2591. Runtime behaviour is unchanged.
