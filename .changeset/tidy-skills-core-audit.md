---
'@pikku/skills': patch
---

Audit the twelve core skills against the shipped APIs and correct the drift.

- pikku-ai-agent: `instructions` does not exist — the prompt is `role`/`personality`/`goal` (required); tools are `ref()` handles; import from `#pikku/agent/pikku-agent-types.gen.js`; invoke via `rpc.agent.*` rather than `runAIAgent(name, input, { singletonServices })`
- pikku-scenario: step bodies live under `default`/`browser`/`cli` bindings, not a `func`; `scaffold.scenarios` is a boolean, not the rejected `"auth"` string
- pikku-addon: there is no `addon()` helper — `ref()` covers local and addon functions
- pikku-realtime: SSE is `PikkuRealtime.subscribeToTopic`; `publish`'s channelId argument excludes rather than targets
- pikku-cli: factories come from `#pikku`; documents options parsing, permissions/middleware/auth and the generated websocket backend
- pikku-services, pikku-config, pikku-middleware, pikku-rpc, pikku-workflow, pikku-queue, pikku-cron, pikku-websocket: corrected option names, wire objects, scopes/secrets coverage and cross-skill routing
