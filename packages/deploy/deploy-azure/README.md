# @pikku/deploy-azure

Azure Functions deploy adapter for Pikku. Generates v4 entry points with
code-based trigger registration, `host.json`, `local.settings.json` and the
infra manifest.

Build-time only — it never runs inside your function. The runtime counterpart is
`@pikku/azure-functions`.

## Install

```bash
npm install -D @pikku/deploy-azure
```

## Usage

```bash
npx pikku deploy --provider azure
```

## Docs

https://pikku.dev/docs
