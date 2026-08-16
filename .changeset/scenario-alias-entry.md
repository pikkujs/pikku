---
'@pikku/core': patch
'@pikku/cli': patch
---

Give the scenario test surface its own `#pikku/scenario` entry

Scenario files are app code, so they belong inside the generated alias — but
they are a distinct surface from wiring, and folding ~11 test-only names into
the main hub would crowd it for every app that never writes a scenario. They
get their own sub-entry instead.

The generated scenario barrel now re-exports the helpers a step file reaches
for — `requireScenarioEnv`, `requireActor`, `createCookieJar`, `pollUntil`,
`createScenarioRunner`, `postScenarioJson`, `readScenarioHttpResponse` and the
types beside them — so a scenario file has one specifier to import from and
never has to know whether a helper is typed against this project or shipped by
the framework. The names join the `ecosystem/scenario` and `ecosystem/persona`
facades on the way through.
