---
'@pikku/core': patch
'@pikku/cli': patch
---

Docs only, no runtime change. Every export reachable from `@pikku/core`'s
entry points now carries TSDoc (1,100 of 1,100, up from 447), including
`runPikkuFunc`, `wireHTTP`, `pikkuState`, `PikkuRPCService`, `wireQueueWorker`,
`wireScheduler`, the service contracts and every error class (with the HTTP
status it maps to). Framework plumbing that generated code calls is tagged
`@internal`; nothing was removed from the exports.

`@pikku/cli`: the generated `wireAddon`, `pikkuServerLifecycle` and the addon
`wireTriggerWebhookSource` now point their `@example` at online-shop snippets.
