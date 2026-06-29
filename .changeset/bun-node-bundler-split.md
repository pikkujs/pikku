---
'@pikku/cli': patch
---

feat(cli): native Bun.build bundler + runtime DI split for deploy & dev

Deploys and `pikku dev` now use a runtime-appropriate implementation chosen once
via dependency injection, instead of inline `typeof Bun` checks.

- **Bundler**: a `Bundler` interface with a shared `BaseBundler` (dead-module
  stubbing, dependency extraction, package.json + hashing) and two backends —
  `NodeBundler` (esbuild) and `BunBundler` (native `Bun.build`). Under bun the
  deploy bundle now resolves bun's `.bun` store / per-workspace symlinks natively
  (esbuild's `nodePaths` walk assumes a hoisted root and failed there). Bun's
  metafile omits external imports, so externals are captured via the resolve
  plugin to drive per-unit dependency extraction. Full identifier minification is
  used under bun (safe — pikku's error→status reflection compares same-class
  instances and workflow exceptions hardcode `.name`).
- **Dev server**: a `DevServerRunner` interface with `NodeServerRunner`
  (`@pikku/node-http-server` + `ws`) and `BunServerRunner` (`@pikku/bun-server`),
  each also supplying the runtime's EventHub.
- The runtime is resolved once in `services.ts`; `bundler` and `devServerRunner`
  are injected singletons. No `typeof Bun` branches remain in the pipeline or the
  dev command.
- Also removes a redundant `as` cast on an `rpc.invoke()` result (PKU940) now
  that the generated map types the output.
