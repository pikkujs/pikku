---
'@pikku/cli': patch
'@pikku/core': patch
'@pikku/n8n-import': patch
'@pikku/deploy': patch
'@pikku/schedule': patch
'@pikku/express': patch
'@pikku/node-http-server': patch
'@pikku/skills': patch
---

Delete everything deprecated, with no shims: the `@pikku/ai-voice` and `@pikku/openapi-to-zod-schema` packages (use `@pikku/core/agent` and `@pikku/openapi-parser`), the `pikkuStudio` alias (use `definePlugin`), the `PikkuTaskScheduler` alias (use `InMemorySchedulerService`), the `pikku semver` command (use `pikku release diff` / `pikku release snapshot`), the unprefixed local-content read fallback (files must live under `private/` or `public/`; `resolveContentRequestTarget` drops its `mode` argument), the legacy `security: 'encrypted'` column annotation (use `security: 'secret'` with `form: 'wrapped'`), and the validator checks for the removed `ban()`/`virtualUser()` aliases and the dead Next.js client.
