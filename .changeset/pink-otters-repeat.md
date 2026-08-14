---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/inspector': patch
'@pikku/playwright': patch
---

Move the scenario and feature surface off `@pikku/core/workflow` and onto
`@pikku/core/scenario`. Scenarios extend workflows, so the production workflow
wiring no longer names a scenario module in its import graph. Feature and
scenario types are declared in their own `scenario.types.ts` rather than in
`workflow.types.ts`. Import `requireActor`, `requireScenarioEnv`, `pollUntil`,
`createCookieJar`, `addFeature`, `ScenarioHttpResponse` and the rest from
`@pikku/core/scenario`; `HttpPersonasConfig` now comes from
`@pikku/core/persona` rather than `@pikku/core/services`.
