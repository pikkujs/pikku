---
'@pikku/addon-console': patch
'@pikku/code-edit': patch
---

Licence change: `@pikku/addon-console` and `@pikku/code-edit` move from MIT to AGPL-3.0-only, because they depend on or import `@pikku/cli` or `@pikku/inspector-go`, which are AGPL-3.0-only. Versions published before this release keep the licence they shipped with. With `scaffold.console` on, codegen wires the console addon into your app; `pikku ci` removes it from deployed bundles, so turn `scaffold.console` off if you build for production another way. Details in docs/MIGRATION.md.
