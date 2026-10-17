---
'@pikku/cli': patch
'@pikku/inspector-go': patch
---

The CLI can inspect with a native engine: the `pikku-inspect` binary from `@pikku/inspector-go`, built on typescript-go (TypeScript 7). It generates output identical to the TypeScript inspector (`@pikku/inspector`, TypeScript 6 compiler API), which stays the default. Opt in with `"inspector": "native"` in `pikku.config.json`, `--inspector native`, or `PIKKU_INSPECTOR=native`. The flag beats the environment variable, which beats the config key. Any other value is rejected, including the old `PIKKU_INSPECTOR=go`; use `native`.

There is no silent fallback. If `native` is selected and no `pikku-inspect` binary exists for the platform, the CLI stops with an error that names the TypeScript engine. The codegen child that `pikku dev` and watch mode start inherits the parent's engine.
