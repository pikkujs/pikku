---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/n8n-import': patch
'@pikku/addon-console': patch
'@pikku/openapi-parser': patch
'@pikku/skills': patch
---

`#pikku` is a namespace, not a module: one subpath per wiring

The bare `#pikku` specifier resolved to `.pikku/pikku-types.gen.ts`, a hub that
re-exported all twelve wiring leaves with `export *` — undoing the split the
leaves exist for, each of which still says so in its own generated header
("HTTP-specific type definitions for tree-shaking optimization"). Reaching that
hub put 33 distinct `@pikku/core` subpaths into the module graph, and neither
consumer could drop them again: bundlers keep `export *` chains because the app
declares no `sideEffects`, and Node and tsx do not tree-shake at all, so an app
with no queues still executed `@pikku/core/queue` at boot.

The hub is gone. An app now imports the leaf the name belongs to —
`#pikku/function`, `#pikku/http`, `#pikku/workflow` — and a project's `imports`
map declares two patterns, because both resolvers pick the more specific one:

```json
"#pikku/*.js": "./.pikku/*.ts",
"#pikku/*": "./.pikku/*/index.ts"
```

A source tree names the `.ts` on both. Webpack, esbuild and Bun all rewrite a
`.js` specifier to the `.ts` beside it for a relative import but not for an
imports-map target, so a `.js` target there resolves to a file that does not
exist. The two places that keep `.js` are the ones where it is the real file: a
published addon, whose map points into `dist`, and a project that imports a
declaration-only generated file such as `pikku-rpc-wirings-map.gen.d.ts`, where
naming the `.js` lets the type resolver's own mapping reach the `.d.ts`.

`pikku` generates the leaf indexes and removes the hub, and `pikku validate`
reports a barrel import as an error. The split also turns the addon boundary
from advice into a rule: an addon never generates the wiring leaves, so
`#pikku/http` fails at the specifier rather than yielding "no exported member"
from a hub that quietly dropped the re-export.
