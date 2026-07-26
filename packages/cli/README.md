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

## Docs

https://pikku.dev/docs
