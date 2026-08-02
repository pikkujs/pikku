---
'@pikku/core': patch
'@pikku/cli': patch
---

Keep the persona runtime off the production barrels

`@pikku/core/services` exported `HttpPersona`, `createHttpPersonas` and
`readScenarioHttpResponse` as values, and `@pikku/core/workflow` exported
`readScenarioHttpResponse` and `postScenarioJson`. Both are barrels a production
server imports, and `http-personas` reaches the actor-flow conversation runner
and through it the agent runner — so signing-in-as-a-persona machinery sat in the
module graph of every app that imported services.

Tree-shaking only removes that if you bundle. An unbundled Node or Lambda deploy
loads whatever the graph names, which is the case this matters in.

The values now come from `@pikku/core/persona`, which is where the rest of the
persona API already lives. **Types stay exactly where they were** — `import type`
erases, so it costs a bundle nothing, and moving them would put core in a cycle
with the code that describes its own function types.

`serialize-personas` generates the new import, so a regenerated
`pikku-personas.gen.ts` picks it up with no edit. Anything importing these four
values from `@pikku/core/services` or `@pikku/core/workflow` changes the
specifier to `@pikku/core/persona`; the names and signatures are unchanged.

A test walks each barrel's value-import graph and fails if scenario runtime
reappears, so this cannot regress quietly.
