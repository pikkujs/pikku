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

- `native` (default) — the `pikku-inspect` binary from `@pikku/inspector-go`,
  built on typescript-go (TypeScript 7). Several times faster. Installed for
  your platform through an optional dependency.
- `typescript` — `@pikku/inspector`, on the TypeScript 6 compiler API.

Choose with, in order of precedence, the `--inspector` flag, the
`PIKKU_INSPECTOR` environment variable, or the `inspector` key in
`pikku.config.json`:

```json
{
  "inspector": "typescript"
}
```

With no engine chosen and no `pikku-inspect` binary for your platform, the CLI
warns and uses `typescript`. If `native` is chosen explicitly, a missing binary
is an error instead.

## Docs

https://pikku.dev/docs
