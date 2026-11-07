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

## Inspector

The CLI reads your source with the `pikku-inspect` binary from
`@pikku/inspector-go`, built on typescript-go (TypeScript 7). It is installed
for your platform through an optional dependency.

If there is no binary for your platform, `pikku` stops at inspection and says
so. Build one from `packages/inspector-go` (`go build ./cmd/pikku-inspect`) and
point `PIKKU_INSPECTOR_GO_BIN` at it.

## Docs

https://pikku.dev/docs
