---
"@pikku/core": patch
"@pikku/console": patch
---

Stop browser bundles pulling the @pikku/core server runtime.

`@pikku/console` (a browser package) imported pure helpers (`buildRunTimeline`,
`reconstructStateAt`, `reconstructFinalState`, `generateCommandHelp`) from the
`@pikku/core/workflow` and `@pikku/core/cli` barrels. Those barrels also
re-export `PikkuWorkflowService`, `deriveInvocationId` (which imports Node's
`crypto`), and the queue workers — so importing the pure helpers dragged the
entire server runtime into the browser bundle.

Two fixes:

1. Expose browser-safe subpath exports that contain only pure, type-only-import
   modules — `@pikku/core/workflow/timeline` (run-timeline),
   `@pikku/core/workflow/types` (pure type surface), and
   `@pikku/core/cli/command-parser` — and import from those in `@pikku/console`
   so the server barrels stay out of the browser's live bundle.

2. Import Node's crypto via the explicit `node:crypto` specifier in the
   server-only `utils/hash.ts` and `wirings/workflow/workflow-invocation-id.ts`
   (both use `createHash`). Bundlers externalize `node:`-prefixed builtins
   instead of routing them through a browser `crypto` alias, so even when the
   workflow service survives in a consumer's graph as tree-shaken dead code
   (its `addError` side-effects), its transitive `createHash` import no longer
   breaks the browser dep optimizer.
