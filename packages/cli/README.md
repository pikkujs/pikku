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

The CLI reads your source with an inspector binary from `@pikku/inspector-go`.
Two engines speak the same protocol:

| engine | binary | built on | binary override |
| --- | --- | --- | --- |
| `go` | `pikku-inspect` | typescript-go (the reference) | `PIKKU_INSPECTOR_GO_BIN` |
| `rs` | `pikku-inspect-rs` | tsrs, a Rust port of typescript-go | `PIKKU_INSPECTOR_RS_BIN` |

Pick one with, in this order: `pikku all --inspector rs`, the `PIKKU_INSPECTOR`
environment variable (`go` or `rs`), the `"inspector": "rs"` key of
`pikku.config.json`, then the package default (`rs`). The helpers other tools
call (code-edit, the console's type diagnostics) follow the same choice.

Each binary ships for your platform inside `@pikku/inspector-go` under
`prebuilt/`. If the selected engine has none, `pikku` stops at inspection and
names the variable to set: build `pikku-inspect` with
`go build ./cmd/pikku-inspect` in `packages/inspector-go`, or `pikku-inspect-rs`
with `cargo build --release` in `packages/inspector-rust`, and point
`PIKKU_INSPECTOR_GO_BIN` / `PIKKU_INSPECTOR_RS_BIN` at it.

## Docs

https://pikku.dev/docs
