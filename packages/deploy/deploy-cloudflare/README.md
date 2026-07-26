# @pikku/deploy-cloudflare

Cloudflare deploy adapter for Pikku. A typed wrapper around the Cloudflare REST
API for managing Workers, Queues, D1, R2, secrets and cron triggers, plus
`wrangler.toml` generation.

Build-time only — it never runs inside the Worker. The runtime counterpart is
`@pikku/cloudflare`.

## Install

```bash
npm install -D @pikku/deploy-cloudflare
```

## Usage

```bash
npx pikku deploy --provider cloudflare
```

## Docs

https://pikku.dev/docs
