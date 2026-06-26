---
'@pikku/deploy-cloudflare': patch
'@pikku/cli': patch
---

feat(deploy): inject platform services into `target: 'server'` container entries

The generic server (container) entry booted the user's
`createSingletonServices(config)` with no platform injection, so a container
that relies on a platform-provided service (kysely from `DATABASE_URL`, secrets
from `PIKKU_SECRET_KEK`, …) 500s on first access — the provider's contributors
only ran in the serverless worker entries.

The provider adapter gains an optional `generateServerEntrySource(ctx)`; the
build pipeline now prefers it over the provider-agnostic generator for server
units. The Cloudflare adapter implements it to emit a `@pikku/node-http-server`
entry that runs the same contributor-driven `createPlatformServices` as its
workers — sourcing bindings from `process.env` and merging the result into
`createSingletonServices` exactly like `setupServices` does on the worker. The
CF-runtime service blocks (queue/workflow/AI) are omitted since a Node
container carries no such Worker bindings. Providers that don't implement the
hook fall back to the unchanged generic generator.
