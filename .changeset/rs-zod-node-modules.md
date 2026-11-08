---
'@pikku/inspector-go': patch
---

The Rust inspector now converts Zod schemas that import a package under `node_modules` (such as `defineAnalyticsEvents` from `@pikku/core/analytics`) and finds `zod` installed beside the schemas rather than at the project root, so `pikku all` no longer fails with `Cannot find module 'zod'` or `Could not convert Zod schema ... without Node` on a bun or pnpm workspace.
