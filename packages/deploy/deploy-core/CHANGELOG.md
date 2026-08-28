# @pikku/deploy

## 0.12.2

### Patch Changes

- 80eb5c0: Generate a desktop shell from `pikku deploy apply --desktop`

  `pikku deploy apply --provider standalone --runtime bun --desktop` now emits a
  `src-tauri/` crate that ships the compiled binary as a sidecar and opens a
  window on the server's own HTTP origin, so cookies, CORS and OAuth behave
  exactly as they do in a browser. Regeneration is idempotent and leaves an
  edited file alone rather than overwriting it.

  `--desktop-url https://app.example.com` builds the other shape: a shell that
  points at an already-deployed server. Nothing is bundled — no sidecar, no
  binary, and so no bun runtime to compile one — and the window is declared in
  `tauri.conf.json` rather than opened from Rust, because the origin is known up
  front. The url can also live in `pikku.config.json` as `deploy.desktop.url`,
  alongside `deploy.desktop.identifier`.

  Supporting changes: `SERVER_READY_MARKER` moved to `@pikku/deploy` (the CLI
  re-exports it from its old path), both HTTP runtimes expose the port they
  actually bound so `--port 0` reports a real port, and the generated server
  entry exits when its parent process goes away.

- 80eb5c0: feat: serve a built frontend from the pikku server's own origin

  A new `frontend` key in `pikku.config.json` names a directory of built
  frontend output. `pikku serve` mounts it, and `pikku deploy` ships it inside
  the distributable — into a directory beside the bundle for the node runtime,
  and embedded in the binary for a `bun build --compile` standalone. `pikku dev`
  deliberately ignores it and says so, because the frontend's own dev server owns
  that job.

  Pikku reads the frontend's output and never builds it, so an unbuilt directory
  fails with a message that says which build to run rather than booting a server
  that answers every page with a 404.

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
