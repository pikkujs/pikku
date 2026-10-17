---
'@pikku/cli': patch
'@pikku/inspector-go': patch
---

The CLI can inspect with a native engine: the `pikku-inspect` binary from `@pikku/inspector-go`, built on typescript-go (TypeScript 7). It is the default, and generates output identical to the TypeScript inspector (`@pikku/inspector`, TypeScript 6 compiler API). Choose the TypeScript one with `"inspector": "typescript"` in `pikku.config.json`, `--inspector typescript`, or `PIKKU_INSPECTOR=typescript`. The flag beats the environment variable, which beats the config key. Any other value is rejected, including the old `PIKKU_INSPECTOR=go`; use `native`.

When no engine is chosen and no `pikku-inspect` binary exists for the platform, the CLI warns and uses the TypeScript engine. An explicit `native` with no binary stops with an error that names the TypeScript engine. The codegen child that `pikku dev` and watch mode start inherits the parent's engine.
