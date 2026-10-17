---
'@pikku/cli': patch
'@pikku/inspector-go': patch
---

The CLI now inspects with the native engine by default: the `pikku-inspect` binary from `@pikku/inspector-go`, built on typescript-go (TypeScript 7). The TypeScript inspector (`@pikku/inspector`, TypeScript 6 compiler API) stays supported and generates identical output. Opt into it with `"inspector": "typescript"` in `pikku.config.json`, `--inspector typescript`, or `PIKKU_INSPECTOR=typescript`. The flag beats the environment variable, which beats the config key. Any other value is rejected, including the old `PIKKU_INSPECTOR=go`; use `native`.

There is no silent fallback. If `native` is selected and no `pikku-inspect` binary exists for the platform, the CLI stops with an error that names the TypeScript opt-in. The codegen child that `pikku dev` and watch mode start inherits the parent's engine.
