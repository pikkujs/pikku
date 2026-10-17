# @pikku/cli

The Pikku CLI. Inspects your TypeScript source and generates bootstrap files,
typed clients, OpenAPI specs and deployment artifacts.

## Install

```bash
npm install -D @pikku/cli
```

## Usage

```bash
npx pikku          # generate everything from pikku.config.json
npx pikku dev      # generate, then run a dev server with hot reload
npx pikku db migrate
npx pikku deploy
```

Configuration lives in `pikku.config.json` — `srcDirectories`, `outDir` and the
client files to emit.

## Inspector engine

The CLI reads your source with one of two engines, which generate identical
output:

- `typescript` (default) — `@pikku/inspector`, on the TypeScript 6 compiler
  API.
- `native` — the `pikku-inspect` binary from `@pikku/inspector-go`, built on
  typescript-go (TypeScript 7). Several times faster. Installed for your
  platform through an optional dependency.

Choose with, in order of precedence, the `--inspector` flag, the
`PIKKU_INSPECTOR` environment variable, or the `inspector` key in
`pikku.config.json`:

```json
{
  "inspector": "native"
}
```

If `native` is selected and there is no `pikku-inspect` binary for your
platform, the CLI stops with an error rather than switching engines; set
`inspector` to `typescript` to carry on.

## Docs

https://pikku.dev/docs
