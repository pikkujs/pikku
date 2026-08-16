---
'@pikku/skills': patch
---

Say what a scenario step is actually given, and stop the skill teaching an RPC call that throws

The `pikku-scenario` skill's two `default` witnesses destructured `rpc` from
services and called `rpc.invoke`. That is exactly what the scenario runner
refuses: steps run in the CLI process, and `guardRpc` answers every member with
*"Scenario tried to run 'getOrder' as an internal step. Every workflow.do in a
scenario must carry { actor: actors.x }"*. Both examples now go through
`requireActor(scenarioStep).invoke`, which is the path the surrounding prose
already described.

Adds a **What a step is given** section, because nothing said it. The services
object is built by hand in `scenario.ts` and holds `logger`, `workflowService`,
`workflowRunService` and — only when the project declares agents — `agentRunner`.
There is no `kysely`, no `variables`, no `secrets` and none of the project's own
services, so a step that destructures one gets `undefined` and fails on first
use, which reads like a broken container and is not. The section names the three
ways in (`invoke`, `invokeRaw`, a plain `fetch` at `env.apiUrl`), the two
consequences that shape how steps get written, and the condition on
`agentRunner` — `createDevAgentRunner` needs a base URL *and* a key together, so
a project with only `OPENAI_API_KEY` set gets `undefined` and every conversing
scenario fails before the persona says anything.

Adds **Declaring personas in TypeScript**, covering the one-call rule and the
trap underneath it: `definePersonas` is read from source and never evaluated, so
every value must be statically knowable — but only `name` is validated. A
computed `personality` is dropped in silence and the persona runs with a blank
temperament. `stringProperty` accepts `ts.isStringLiteralLike`, so a
no-substitution template literal is read and is the way to write a long
personality across several lines; a `+` concatenation is not. Also records that
`actorInstructions` builds the conversing persona's prompt from `name`,
`jobTitle`, `personality` and the scenario's `task` only — `disposition`,
`goals` and `roles` are stored and shown but never reach it.

Finally, the three `import ... from '#pikku/workflow/pikku-workflow-types.gen.js'`
lines now point at `#pikku/scenarios/pikku-scenario-types.gen.js`, which is where
the scenario surface moved when the barrel was split.

Also corrects three import specifiers the skill still taught from before the
`#pikku` leaves landed: `#pikku/scenarios/pikku-scenario-types.gen.js` and
`@pikku/core/workflow` both become `#pikku/scenario`, which is the one door the
leaf exists to be and the specifier every step file in the e2e suite already
uses.
