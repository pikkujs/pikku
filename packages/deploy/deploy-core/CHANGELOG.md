# @pikku/deploy

## 0.12.1

### Patch Changes

- 32616af: Give the deploy pipeline one shared contract instead of a copy per adapter

  `DeploymentManifest`, `DeploymentUnit`, `EntryGenerationContext` and
  `ProviderAdapter` were hand-copied into eleven source files across the four
  provider adapters and the CLI — three copies inside `@pikku/deploy-cloudflare`
  alone. Nothing compared the copies, so they had already drifted: several typed
  `role` as a bare `string`, and none carried the manifest's addon-scoping fields.

  They now live in a new zero-dependency `@pikku/deploy` package that every
  adapter and the CLI import, and each adapter declares `implements
ProviderAdapter` so the compiler checks it against the contract it claims to
  satisfy. That check immediately caught a real disagreement: the deploy result's
  `workersDeployed` and `resourcesCreated` were `string[]` from Cloudflare — the
  shape the result file and the generated SDK types already record — but
  `Array<{ name: string }>` from the standalone adapter. Both are now `string[]`.

  The Lambda and Azure adapters also derived their esbuild externals from a
  hand-written list of 25 node builtins, so anything outside it (`async_hooks`,
  `perf_hooks`, `timers`, `http2`, …) was bundled instead of resolved from the
  runtime. They now use `nodeBuiltinExternals()`, which reads `builtinModules`
  from the running Node and cannot fall behind it.
