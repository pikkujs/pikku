# @pikku/deploy-standalone

Standalone deploy adapter for Pikku. Bundles a project into a single unit and
ships it as either a `bundle.js` run with Node (`@pikku/node-http-server`), or a
self-contained executable compiled with `bun build --compile`
(`@pikku/bun-server`).

Build-time only — it never runs inside the deployed process.

## Install

```bash
npm install -D @pikku/deploy-standalone
```

## Usage

```bash
npx pikku deploy --provider standalone          # node bundle
npx pikku deploy --provider standalone --runtime bun
```

## Docs

https://pikku.dev/docs
