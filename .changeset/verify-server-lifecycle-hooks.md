---
'@pikku/cli': patch
---

`pikku workspace validate` now warns when a project boots its own server instead of using the `pikkuServerLifecycle` hooks.

It fires only when the root `start`/`dev` script starts a server without `pikku dev` / `pikku serve` **and** no Pikku runtime adapter (`@pikku/express`, `@pikku/fastify`, `@pikku/uws`, `@pikku/lambda`, `@pikku/cloudflare`, `@pikku/next`, …) is installed — depending on an adapter means the hand-rolled entrypoint is deliberate, since `pikku serve` cannot host those runtimes. Scripts that delegate (turbo, nx, `yarn workspace`, npm-run-all, …) are not flagged either.

Opt out — or escalate to an error — with `"lint": { "customServerBootstrap": "off" }` in `pikku.config.json`.
