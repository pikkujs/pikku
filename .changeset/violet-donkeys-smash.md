---
'@pikku/cli': patch
---

validate: flag static imports of packages the deploy bundler stubs

The deploy bundler replaces the AI SDK packages (`@pikku/ai-vercel`, `@ai-sdk/*`,
`ai`) with `export {}` in every unit that does not require `agentRunner`, so a
static named import of one in `services.ts` fails to bundle with an opaque
esbuild error repeated once per unit. `pikku fabric validate` now reports this as
`services-static-stubbed-import` and points at the lazy-import shape the starter
template uses. The service-to-module map moved to its own module so the check and
the bundler read the same list.
