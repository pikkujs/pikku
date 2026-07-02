---
'@pikku/cli': patch
---

User-flow actor registry in pikku.config.json: `userFlows.actors` (email,
jobTitle, personality per actor) generates a typed
`.pikku/workflow/pikku-user-flow-actors.gen.ts` with `userFlowActorConfigs`
and `createUserFlowActors({ apiUrl, secret })` — wire the result as the
`actors` singleton service for pikkuUserFlow.
